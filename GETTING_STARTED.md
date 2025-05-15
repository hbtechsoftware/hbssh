# Getting Started with HBSSH

This guide will help you set up and run the HBSSH project for development.

## Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher)
- npm (included with Node.js)
- Git

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/hbssh.git
   cd hbssh
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Running the Application

To start the application in development mode:

```bash
npm start
```

To start with developer tools open:

```bash
npm run dev
```

## Project Structure

- `main.js` - Main Electron process
- `src/main/` - Main process code
- `src/renderer/` - Renderer process code (UI)
- `src/common/` - Shared code between main and renderer
- `src/preload/` - Preload scripts for secure Electron context bridging

## Development Workflow

1. Start the application in development mode
2. Make changes to the code
3. Use the application to test your changes
4. For UI changes, you may need to reload the app (`Ctrl+R` or `Cmd+R`)

## Building for Production

To build the application for your current platform:

```bash
npm run build
```

To build specifically for Windows:

```bash
npm run build:win
```

To build specifically for macOS:

```bash
npm run build:mac
```

Builds will be placed in the `dist/` directory.

## Next Steps

Check the `ROADMAP.md` file for planned features and development phases.

## Troubleshooting

If you encounter issues with native modules on Windows, you may need to install Windows Build Tools:

```bash
npm install --global --production windows-build-tools
```

For other issues, please check the project issues or create a new one. 