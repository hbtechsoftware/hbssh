# HBSSH - Cross-Platform SSH Client

A modern, feature-rich SSH client for Windows and macOS built with Electron.

## Features

- SSH/SFTP client with key and password authentication
- Tabbed terminal interface with color coding
- Graphical SFTP browser with drag & drop support
- Session management for quick connections
- Port forwarding and tunneling
- Built-in network tools
- Encrypted credential storage

## Development

### Prerequisites

- Node.js (v16+)
- npm or yarn
- Git

### Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/hbssh.git
cd hbssh

# Install dependencies
npm install

# Start the application
npm start
```

### Build

```bash
# Build for all platforms
npm run build

# Build for Windows
npm run build:win

# Build for macOS
npm run build:mac
```

## Project Structure

```
hbssh/
├── src/
│   ├── main/           # Main process files
│   ├── renderer/       # Renderer process files
│   ├── common/         # Shared code
│   └── preload/        # Preload scripts
├── resources/          # Static resources
├── build/              # Build configuration
└── dist/               # Build output
```

## License

UNLICENSED - Copyright (c) HBTech