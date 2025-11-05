import express, { Request, Response } from 'express';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import path from 'path';

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static('public'));

// Store S3 clients per session (in production, use proper session management)
const s3Clients = new Map<string, S3Client>();

// Initialize S3 client with credentials
app.post('/api/init', (req: Request, res: Response) => {
  const { accessKeyId, secretAccessKey, region = 'us-east-1' } = req.body;

  if (!accessKeyId || !secretAccessKey) {
    return res.status(400).json({ error: 'Missing credentials' });
  }

  try {
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
    });

    s3Clients.set(sessionId, s3Client);
    res.json({ sessionId, message: 'Credentials configured successfully' });
  } catch (error: any) {
    console.error('Error initializing S3 client:', error);
    res.status(500).json({ error: 'Failed to initialize S3 client', details: error.message });
  }
});

// List objects in a bucket with optional prefix (folder path)
app.get('/api/list', async (req: Request, res: Response) => {
  const { sessionId, bucket, prefix = '' } = req.query;

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

  try {
    console.log(`Listing bucket: ${bucket}, prefix: ${prefix}`);
    
    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix as string,
      Delimiter: '/',
    });

    const response = await s3Client.send(command);

    // Separate folders and files
    const folders = (response.CommonPrefixes || []).map((p) => ({
      type: 'folder',
      name: p.Prefix!.slice((prefix as string).length),
      fullPath: p.Prefix!,
    }));

    const files = (response.Contents || [])
      .filter((obj) => obj.Key !== prefix) // Exclude the folder itself
      .map((obj) => ({
        type: 'file',
        name: obj.Key!.slice((prefix as string).length),
        fullPath: obj.Key!,
        size: obj.Size,
        lastModified: obj.LastModified,
      }));

    res.json({
      folders,
      files,
      prefix: prefix || '',
    });
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

  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'Missing sessionId' });
  }

  if (!bucket || typeof bucket !== 'string' || !key || typeof key !== 'string') {
    return res.status(400).json({ error: 'Missing bucket or key' });
  }

  const s3Client = s3Clients.get(sessionId);
  if (!s3Client) {
    return res.status(401).json({ error: 'Invalid session' });
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

  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'Missing sessionId' });
  }

  if (!bucket || typeof bucket !== 'string' || !key || typeof key !== 'string') {
    return res.status(400).json({ error: 'Missing bucket or key' });
  }

  const s3Client = s3Clients.get(sessionId);
  if (!s3Client) {
    return res.status(401).json({ error: 'Invalid session' });
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
