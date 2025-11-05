#!/usr/bin/env bun
import express, { Request, Response } from 'express';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { fromIni } from '@aws-sdk/credential-providers';
import path from 'path';
import fs from 'fs';
import os from 'os';

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static('public'));

// Store S3 clients per session (in production, use proper session management)
const s3Clients = new Map<string, S3Client>();

// Cache for list results: key is "sessionId:bucket:prefix", value is { data, timestamp }
const listCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Validation helper
function validateAndGetS3Client(
  sessionId: any,
  bucket: any,
  key: any
): { client?: S3Client; error?: string; statusCode?: number } {
  if (!sessionId || typeof sessionId !== 'string') {
    return { error: 'Missing sessionId', statusCode: 400 };
  }

  if (!bucket || typeof bucket !== 'string' || !key || typeof key !== 'string') {
    return { error: 'Missing bucket or key', statusCode: 400 };
  }

  const s3Client = s3Clients.get(sessionId);
  if (!s3Client) {
    return { error: 'Invalid session', statusCode: 401 };
  }

  return { client: s3Client };
}

// CLI mode configuration
let cliMode = false;
let cliProfile: string | null = null;
let cliBucket: string | null = null;
let cliRootPrefix: string | null = null;
let cliRegion: string | null = null;
let cliSessionId: string | null = null;

// Parse S3 URI (s3://bucket/prefix or s3://bucket)
function parseS3Uri(uri: string): { bucket: string; prefix: string } {
  if (!uri.startsWith('s3://')) {
    throw new Error('Invalid S3 URI. Must start with s3://');
  }
  
  const withoutProtocol = uri.slice(5); // Remove 's3://'
  const firstSlashIndex = withoutProtocol.indexOf('/');
  
  if (firstSlashIndex === -1) {
    // No prefix, just bucket
    return { bucket: withoutProtocol, prefix: '' };
  }
  
  const bucket = withoutProtocol.slice(0, firstSlashIndex);
  let prefix = withoutProtocol.slice(firstSlashIndex + 1);
  
  // Ensure prefix ends with / if it exists
  if (prefix && !prefix.endsWith('/')) {
    prefix += '/';
  }
  
  return { bucket, prefix };
}

// Parse command line arguments
const args = process.argv.slice(2);
let profileIndex = args.indexOf('--profile');
let bucketIndex = args.indexOf('--bucket');
let s3UriIndex = args.indexOf('--s3-uri');
let regionIndex = args.indexOf('--region');

if (profileIndex !== -1 && profileIndex + 1 < args.length) {
  cliProfile = args[profileIndex + 1];
}

// Support both --bucket and --s3-uri (s3-uri takes precedence)
if (s3UriIndex !== -1 && s3UriIndex + 1 < args.length) {
  const s3Uri = args[s3UriIndex + 1];
  try {
    const parsed = parseS3Uri(s3Uri);
    cliBucket = parsed.bucket;
    cliRootPrefix = parsed.prefix;
  } catch (error: any) {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  }
} else if (bucketIndex !== -1 && bucketIndex + 1 < args.length) {
  const bucketArg = args[bucketIndex + 1];
  // Check if bucket arg looks like an S3 URI
  if (bucketArg.startsWith('s3://')) {
    try {
      const parsed = parseS3Uri(bucketArg);
      cliBucket = parsed.bucket;
      cliRootPrefix = parsed.prefix;
    } catch (error: any) {
      console.error(`❌ ${error.message}`);
      process.exit(1);
    }
  } else {
    cliBucket = bucketArg;
    cliRootPrefix = '';
  }
}

if (regionIndex !== -1 && regionIndex + 1 < args.length) {
  cliRegion = args[regionIndex + 1];
}

// If profile and bucket are provided, enable CLI mode
if (cliProfile && cliBucket) {
  cliMode = true;
  const displayUri = cliRootPrefix 
    ? `s3://${cliBucket}/${cliRootPrefix}` 
    : `s3://${cliBucket}`;
  console.log(`🔐 CLI Mode: Using AWS profile "${cliProfile}" for ${displayUri}`);
  
  // Initialize S3 client with profile
  try {
    // Read region from config file if not provided
    if (!cliRegion) {
      const configPath = path.join(os.homedir(), '.aws', 'config');
      if (fs.existsSync(configPath)) {
        const configContent = fs.readFileSync(configPath, 'utf-8');
        const profileSection = `[profile ${cliProfile}]`;
        const lines = configContent.split('\n');
        let inProfile = false;
        
        for (const line of lines) {
          if (line.trim() === profileSection || line.trim() === `[${cliProfile}]`) {
            inProfile = true;
          } else if (line.trim().startsWith('[')) {
            inProfile = false;
          } else if (inProfile && line.includes('region')) {
            const match = line.match(/region\s*=\s*(.+)/);
            if (match) {
              cliRegion = match[1].trim();
              break;
            }
          }
        }
      }
    }
    
    if (!cliRegion) {
      cliRegion = 'us-east-1'; // Default region
    }
    
    cliSessionId = 'cli-session';
    const s3Client = new S3Client({
      region: cliRegion,
      credentials: fromIni({ profile: cliProfile }),
      useArnRegion: true,
      forcePathStyle: false,
      followRegionRedirects: true, // Enable automatic region redirects
    });
    
    s3Clients.set(cliSessionId, s3Client);
    console.log(`✅ Initialized S3 client for region: ${cliRegion}`);
  } catch (error: any) {
    console.error(`❌ Error initializing S3 client with profile "${cliProfile}":`, error.message);
    process.exit(1);
  }
}

// Get server configuration endpoint
app.get('/api/config', (req: Request, res: Response) => {
  res.json({
    cliMode,
    bucket: cliBucket,
    rootPrefix: cliRootPrefix || '',
    region: cliRegion,
    sessionId: cliSessionId,
  });
});

// Initialize S3 client with credentials (for manual mode)
app.post('/api/init', (req: Request, res: Response) => {
  if (cliMode) {
    return res.status(400).json({ error: 'Server is running in CLI mode' });
  }

  const { accessKeyId, secretAccessKey, region = 'us-east-1', s3Uri } = req.body;

  if (!accessKeyId || !secretAccessKey) {
    return res.status(400).json({ error: 'Missing credentials' });
  }

  if (!s3Uri) {
    return res.status(400).json({ error: 'Missing S3 URI' });
  }

  try {
    // Parse S3 URI to extract bucket and prefix
    const { bucket, prefix } = parseS3Uri(s3Uri);
    
    const sessionId = Math.random().toString(36).substring(7);
    const s3Client = new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      // Enable S3 Access Point support
      useArnRegion: true,
      // Force path style to false for Access Points
      forcePathStyle: false,
      // Enable automatic region redirects
      followRegionRedirects: true,
    });

    s3Clients.set(sessionId, s3Client);
    res.json({ 
      sessionId, 
      bucket,
      rootPrefix: prefix,
      message: 'Credentials configured successfully' 
    });
  } catch (error: any) {
    console.error('Error initializing S3 client:', error);
    res.status(500).json({ error: 'Failed to initialize S3 client', details: error.message });
  }
});

// List objects in a bucket with optional prefix (folder path)
app.get('/api/list', async (req: Request, res: Response) => {
  const { sessionId, bucket, prefix = '', refresh = 'false' } = req.query;

  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'Missing sessionId' });
  }

  if (!bucket || typeof bucket !== 'string') {
    return res.status(400).json({ error: 'Missing bucket name' });
  }

  const s3Client = s3Clients.get(sessionId);
  if (!s3Client) {
    return res.status(401).json({ error: 'Invalid session. Please re-enter credentials.' });
  }

  // Check cache unless refresh is requested
  const cacheKey = `${sessionId}:${bucket}:${prefix}`;
  const shouldRefresh = refresh === 'true';
  
  if (!shouldRefresh) {
    const cached = listCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log(`Cache hit for: ${bucket}/${prefix}`);
      return res.json(cached.data);
    }
  }

  try {
    console.log(`${shouldRefresh ? 'Refreshing' : 'Listing'} bucket: ${bucket}, prefix: ${prefix}`);
    
    let allCommonPrefixes: any[] = [];
    let allContents: any[] = [];
    let continuationToken: string | undefined = undefined;
    
    // Paginate through all results
    do {
      const command = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix as string,
        Delimiter: '/',
        ContinuationToken: continuationToken,
      });

      const response = await s3Client.send(command);
      
      // Accumulate results
      if (response.CommonPrefixes) {
        allCommonPrefixes = allCommonPrefixes.concat(response.CommonPrefixes);
      }
      if (response.Contents) {
        allContents = allContents.concat(response.Contents);
      }
      
      continuationToken = response.NextContinuationToken;
      
      // Log progress for large listings
      if (continuationToken) {
        console.log(`Fetched ${allCommonPrefixes.length} folders and ${allContents.length} files so far...`);
      }
    } while (continuationToken);

    console.log(`Total: ${allCommonPrefixes.length} folders and ${allContents.length} files`);

    // Separate folders and files
    const folders = allCommonPrefixes.map((p) => ({
      type: 'folder',
      name: p.Prefix!.slice((prefix as string).length),
      fullPath: p.Prefix!,
    }));

    const files = allContents
      .filter((obj) => obj.Key !== prefix) // Exclude the folder itself
      .map((obj) => ({
        type: 'file',
        name: obj.Key!.slice((prefix as string).length),
        fullPath: obj.Key!,
        size: obj.Size,
        lastModified: obj.LastModified,
      }));

    const responseData = {
      folders,
      files,
      prefix: prefix || '',
    };

    // Cache the result
    listCache.set(cacheKey, {
      data: responseData,
      timestamp: Date.now(),
    });

    res.json(responseData);
  } catch (error: any) {
    console.error('Error listing objects:', error);
    res.status(500).json({ 
      error: 'Failed to list objects',
      details: error.message 
    });
  }
});

// Get file content for preview
app.get('/api/file', async (req: Request, res: Response) => {
  const { sessionId, bucket, key } = req.query;

  const { client: s3Client, error, statusCode } = validateAndGetS3Client(sessionId, bucket, key);
  if (error) {
    return res.status(statusCode!).json({ error });
  }

  try {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    const response = await s3Client.send(command);
    const bodyContents = await response.Body!.transformToString();

    res.json({
      content: bodyContents,
      contentType: response.ContentType,
    });
  } catch (error: any) {
    console.error('Error getting file:', error);
    res.status(500).json({ 
      error: 'Failed to get file',
      details: error.message 
    });
  }
});

// Download file
app.get('/api/download', async (req: Request, res: Response) => {
  const { sessionId, bucket, key } = req.query;

  const { client: s3Client, error, statusCode } = validateAndGetS3Client(sessionId, bucket, key);
  if (error) {
    return res.status(statusCode!).json({ error });
  }

  try {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    const response = await s3Client.send(command);
    const fileName = path.basename(key);

    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', response.ContentType || 'application/octet-stream');

    // Stream the file
    const stream = response.Body as any;
    stream.pipe(res);
  } catch (error: any) {
    console.error('Error downloading file:', error);
    res.status(500).json({ 
      error: 'Failed to download file',
      details: error.message 
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 S3 Explorer running at http://localhost:${PORT}`);
  console.log(`📦 Open your browser and navigate to the URL above`);
});
