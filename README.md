# S3 Explorer

A simple, local web application for browsing AWS S3 buckets with a clean UI. Built with Bun, TypeScript, Express, and vanilla JavaScript.

## Features

- **AWS Profile Support** - Use your existing AWS profiles from `~/.aws/credentials`
- Browse S3 buckets and navigate folder structures
- View file metadata (size, last modified date)
- Preview text files (.txt, .json, .csv, .log, .md, code files, etc.) without downloading
- Download files directly from the browser
- Breadcrumb navigation for easy folder traversal (click bucket name to return to root)
- Support for S3 Access Point aliases
- Secure - credentials stay local, never stored on disk

## Prerequisites

- [Bun](https://bun.sh) installed on your system
- AWS credentials (Access Key ID and Secret Access Key)
- Access to at least one S3 bucket

## Installation

1. Clone or download this repository

2. Install dependencies:
```bash
bun install
```

## Usage

### Option 1: CLI Mode with AWS Profile (Recommended)

Use your existing AWS profiles from `~/.aws/credentials`:

```bash
bun run server.ts --profile <profile-name> --bucket <bucket-name>
```

**Example:**
```bash
bun run server.ts --profile my-aws-profile --bucket my-bucket-name
```

You can also specify a region (optional, will be read from `~/.aws/config` if not provided):
```bash
bun run server.ts --profile my-aws-profile --bucket my-bucket-name --region eu-central-1
```

Then open your browser at `http://localhost:3000` and the app will automatically connect!

**Advantages:**
- No need to manually enter credentials
- Uses your existing AWS profile configuration
- Safer - credentials stay in your AWS config files
- Faster - skips the credentials form

### Option 2: Manual Credentials Entry

1. Start the server without arguments:
```bash
bun run dev
```

2. Open your browser and navigate to:
```
http://localhost:3000
```

3. Enter your AWS credentials in the form:
   - **Access Key ID**: Your AWS access key
   - **Secret Access Key**: Your AWS secret key
   - **Region**: AWS region (default: eu-central-1)
   - **Bucket Name**: The S3 bucket you want to explore

4. Click **Connect** and start browsing your S3 bucket!

## Features Walkthrough

### Navigation
- Click on folder names (📁) to navigate into folders
- Use the breadcrumb navigation at the top to go back to parent folders
- The current path is always visible

### File Operations
- **Preview**: Click the "Preview" button on text files to view contents in a modal
- **Download**: Click the "Download" button to download any file

### Supported Preview Formats
Text files with these extensions can be previewed:
- Documents: `.txt`, `.md`, `.log`, `.csv`
- Data: `.json`, `.xml`, `.yaml`, `.yml`
- Code: `.js`, `.ts`, `.py`, `.java`, `.go`, `.rs`, `.html`, `.css`, etc.
- Config: `.env`, `.ini`, `.conf`, `.config`, `.properties`

## Security Notes

- Credentials are stored only in memory during your session
- Credentials are never written to disk
- Click "Disconnect" to clear credentials from memory
- This application is designed for local use only

## Technology Stack

- **Runtime**: Bun
- **Backend**: Express.js with TypeScript
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **AWS Integration**: AWS SDK for JavaScript v3

## Project Structure

```
s3-explorer/
├── server.ts           # Express server with S3 API endpoints
├── package.json        # Dependencies and scripts
├── tsconfig.json       # TypeScript configuration
├── public/
│   ├── index.html      # Main UI
│   ├── style.css       # Styling
│   └── app.js          # Frontend logic
└── README.md           # This file
```

## API Endpoints

- `GET /api/config` - Get server configuration (CLI mode status)
- `POST /api/init` - Initialize S3 client with credentials (manual mode only)
- `GET /api/list` - List objects in a bucket with optional prefix
- `GET /api/file` - Get file content for preview
- `GET /api/download` - Download a file

## Troubleshooting

### "Invalid session" error
- Click "Disconnect" and re-enter your credentials

### "Failed to list objects" error
- Verify your AWS credentials are correct
- Ensure the bucket name is correct
- Check that your AWS user has `s3:ListBucket` and `s3:GetObject` permissions

### Files not showing up
- Make sure you have the correct permissions on the bucket
- Check that the region is correct for your bucket

## License

MIT

## Contributing

Feel free to submit issues or pull requests!
