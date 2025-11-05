# S3 Explorer

A simple, local web application for browsing AWS S3 buckets. Built with Bun, TypeScript, Express, and vanilla JavaScript.

## Prerequisites

- [Bun](https://bun.sh) installed on your system
- AWS credentials (Access Key ID and Secret Access Key) or AWS profile configured in `~/.aws/credentials`

## Quick Start

### Run without installation (bunx)
```bash
bunx github:daysm/s3-explorer --profile my-aws-profile --s3-uri s3://my-bucket/
```

### Run locally
```bash
git clone https://github.com/daysm/s3-explorer.git
cd s3-explorer
bun install
bun run server.ts --profile my-aws-profile --s3-uri s3://my-bucket/
```

## S3 URI Format

This application supports S3 URIs for specifying both buckets and prefixes:

- **Bucket only**: `s3://my-bucket` - Browse from the root of the bucket
- **Bucket with prefix**: `s3://my-bucket/path/to/folder/` - Start browsing at a specific folder

When using CLI mode or manual entry, you can specify where you want to start browsing. The application treats this location as the "root" for that session.

## Usage

### Option 1: Specify AWS Profile (Recommended)

Use your existing AWS profiles from `~/.aws/credentials`:


```bash
bun run server.ts --profile my-aws-profile --s3-uri s3://my-bucket-name/path/to/folder/
```

You can also specify a region (optional, will be read from `~/.aws/config` if not provided):
```bash
bun run server.ts --profile my-aws-profile --bucket my-bucket-name --region eu-central-1
```

Then open your browser at `http://localhost:3000` and the app will automatically connect!

### Option 2: Enter Credentials Manually

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

