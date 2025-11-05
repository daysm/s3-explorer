# S3 Explorer

A simple, local web application for browsing AWS S3 buckets with a clean UI. Built with Bun, TypeScript, Express, and vanilla JavaScript.

## Features

- **AWS Profile Support** - Use your existing AWS profiles from `~/.aws/credentials`
- **S3 URI Support** - Browse specific prefixes with `s3://bucket/path/to/folder` format
- Browse S3 buckets and navigate folder structures
- View file metadata (size, last modified date)
- Preview text files (.txt, .json, .csv, .log, .md, code files, etc.) without downloading
- Download files directly from the browser

## Prerequisites

- [Bun](https://bun.sh) installed on your system
- AWS credentials (Access Key ID and Secret Access Key) or AWS profile configured in `~/.aws/credentials`

## Installation

1. Clone or download this repository

2. Install dependencies:
```bash
bun install
```

## S3 URI Format

This application supports S3 URIs for specifying both buckets and prefixes:

- **Bucket only**: `s3://my-bucket` - Browse from the root of the bucket
- **Bucket with prefix**: `s3://my-bucket/path/to/folder/` - Start browsing at a specific folder

When using CLI mode or manual entry, you can specify where you want to start browsing. The application treats this location as the "root" for that session.

## Usage

### Option 1: CLI Mode with AWS Profile (Recommended)

Use your existing AWS profiles from `~/.aws/credentials`:


```bash
bun run server.ts --profile my-aws-profile --s3-uri s3://my-bucket-name/path/to/folder/
```

You can also specify a region (optional, will be read from `~/.aws/config` if not provided):
```bash
bun run server.ts --profile my-aws-profile --bucket my-bucket-name --region eu-central-1
```

Then open your browser at `http://localhost:3000` and the app will automatically connect!

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
   - **Region**: AWS region (default: us-east-1)
   - **S3 URI**: The S3 location to explore (e.g., `s3://my-bucket` or `s3://my-bucket/path/to/folder/`)

4. Click **Connect** and start browsing your S3 bucket!

