# WFLY Music - Complete Setup Guide

## Overview

WFLY Music is a modern music streaming platform with a Node.js backend and a beautiful iOS client. This guide will help you set up both the server and iOS app for optimal performance and background audio playback.

## Server Setup (Node.js)

### Prerequisites

- Node.js 18+ (tested on 20)
- MongoDB 5+
- SSL certificates (for production)

### Installation

1. **Install Dependencies**
   ```bash
   npm install express ws mongodb pino dotenv cors helmet express-rate-limit bcryptjs jsonwebtoken compression zod nanoid multer
   ```

2. **Environment Configuration**
   Create a `.env` file in the server directory:
   ```env
   NODE_ENV=production
   HOST=0.0.0.0
   PORT=7412
   PUBLIC_URL=https://your-domain.com:7412
   ALLOWED_ORIGINS=https://your-domain.com
   
   # TLS Configuration
   TLS_ENABLED=true
   TLS_CERT=/path/to/your/cert.pem
   TLS_KEY=/path/to/your/key.pem
   
   # MongoDB
   MONGODB_URI=mongodb://username:password@localhost:27017/wfly_music?authSource=admin
   
   # JWT Secrets (generate strong secrets for production)
   JWT_SECRET=your-super-secret-jwt-key-here
   ACCESS_TTL_SEC=900
   REFRESH_TTL_SEC=2592000
   
   # Storage
   STORE_DIR=/path/to/audio/files
   UPLOADS_DIR=/path/to/uploads
   
   # Logging
   LOG_LEVEL=info
   ```

3. **Database Setup**
   ```bash
   # Start MongoDB
   mongod --dbpath /path/to/your/db
   
   # The server will automatically create indexes on startup
   ```

4. **Run the Server**
   ```bash
   node server.js
   ```

### Server Features

- ✅ **Artist Authentication** (username/password)
- ✅ **User Authentication** (email/password)
- ✅ **Artist Profile Management** (banner, avatar, bio)
- ✅ **Album Management**
- ✅ **Enhanced Search** (text, genre, artist filters)
- ✅ **User Likes Tracking**
- ✅ **Playlist Management**
- ✅ **Multi-device Sync**
- ✅ **WebSocket Real-time Updates**
- ✅ **HTTP Range Streaming** (MP3/M4A/FLAC/OGG)
- ✅ **HTTPS + WSS Support**

### API Endpoints

#### Authentication
- `POST /api/auth/login` - User login (email/password)
- `POST /api/auth/register` - User registration
- `POST /api/artists/auth/login` - Artist login (username/password)
- `POST /api/artists/auth/register` - Artist registration
- `POST /api/auth/refresh` - Token refresh
- `POST /api/auth/logout` - Logout

#### Music
- `GET /api/home` - Home sections
- `GET /api/search` - Search tracks, artists, albums
- `GET /api/tracks/:id/stream` - Stream audio file
- `POST /api/tracks/:id/like` - Like/unlike track
- `GET /api/artists/:id/profile` - Artist profile

#### User Management
- `GET /api/me` - Current user info
- `GET /api/playlists` - User playlists
- `POST /api/playlists` - Create playlist
- `GET /api/devices` - User devices

## iOS App Setup

### Prerequisites

- Xcode 14+
- iOS 16+ target device
- Apple Developer Account (for background audio)

### Project Configuration

1. **Create New iOS Project**
   - Open Xcode
   - Create new iOS App project
   - Choose SwiftUI interface
   - Set deployment target to iOS 16.0

2. **Replace App Files**
   - Replace `App.swift` with `WFLYApp_Improved.swift`
   - Replace `Info.plist` with the provided `Info.plist`

3. **Configure Signing & Capabilities**
   - Select your project target
   - Go to "Signing & Capabilities"
   - Add the following capabilities:
     - **Background Modes**
       - ✅ Audio, AirPlay, and Picture in Picture
       - ✅ Background processing
       - ✅ Background app refresh
     - **App Groups** (optional, for sharing data between app and extensions)

4. **Update Server Configuration**
   - Open `WFLYApp_Improved.swift`
   - Update `AppConfig.httpBase` with your server URL
   - Ensure HTTPS is used for production

### Background Audio Setup

The iOS app is configured for full background audio playback:

1. **Audio Session Configuration**
   - Configured for `.playback` category
   - Supports AirPlay and Bluetooth
   - Mixes with other audio when appropriate

2. **Remote Command Center**
   - Play/Pause controls
   - Next/Previous track
   - Seek forward/backward
   - Control Center integration

3. **Now Playing Info**
   - Track title, artist, album
   - Playback position and duration
   - Genre information
   - Lock screen integration

4. **Background Tasks**
   - Audio processing background tasks
   - Scheduled refresh tasks
   - Proper task completion handling

### App Features

- ✅ **Modern, Beautiful UI** with gradient backgrounds
- ✅ **Dark Theme** optimized for music listening
- ✅ **Smooth Animations** and transitions
- ✅ **Background Audio Playback** with full control
- ✅ **Lock Screen Controls** and Control Center integration
- ✅ **Artist and User Authentication**
- ✅ **Advanced Search** with genre filtering
- ✅ **Playlist Management**
- ✅ **Real-time Sync** across devices
- ✅ **Offline Capable** (cached tracks)

## Testing

### Server Testing

1. **Health Check**
   ```bash
   curl https://your-domain.com:7412/healthz
   ```

2. **Create Test Artist**
   ```bash
   # Use the CLI when running the server
   node server.js
   # Choose option 1 to create an artist
   ```

3. **Test API Endpoints**
   ```bash
   # Test artist login
   curl -X POST https://your-domain.com:7412/api/artists/auth/login \
     -H "Content-Type: application/json" \
     -d '{"username":"testartist","password":"password123"}'
   ```

### iOS App Testing

1. **Build and Run**
   - Connect iOS device
   - Build and run in Xcode
   - Test authentication flows

2. **Background Audio Testing**
   - Start playing a track
   - Press home button
   - Verify audio continues playing
   - Test Control Center controls
   - Test lock screen controls

3. **Network Testing**
   - Test with different network conditions
   - Verify streaming works over cellular
   - Test reconnection after network loss

## Production Deployment

### Server Deployment

1. **Use PM2 for Process Management**
   ```bash
   npm install -g pm2
   pm2 start server.js --name "wfly-music"
   pm2 startup
   pm2 save
   ```

2. **Use Nginx as Reverse Proxy**
   ```nginx
   server {
       listen 443 ssl;
       server_name your-domain.com;
       
       ssl_certificate /path/to/cert.pem;
       ssl_certificate_key /path/to/key.pem;
       
       location / {
           proxy_pass http://localhost:7412;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

3. **Set up SSL Certificates**
   - Use Let's Encrypt for free SSL
   - Configure automatic renewal

### iOS App Deployment

1. **App Store Preparation**
   - Update version numbers
   - Add app icons and launch screens
   - Test on multiple devices
   - Prepare app store metadata

2. **TestFlight Beta Testing**
   - Upload to App Store Connect
   - Invite beta testers
   - Collect feedback and crash reports

3. **App Store Submission**
   - Submit for review
   - Respond to review feedback
   - Monitor crash reports and analytics

## Troubleshooting

### Common Server Issues

1. **MongoDB Connection Failed**
   - Check MongoDB is running
   - Verify connection string
   - Check firewall settings

2. **SSL Certificate Issues**
   - Verify certificate paths
   - Check certificate validity
   - Ensure proper permissions

3. **CORS Errors**
   - Update `ALLOWED_ORIGINS` in `.env`
   - Check client URL configuration

### Common iOS Issues

1. **Background Audio Not Working**
   - Verify Background Modes capability
   - Check audio session configuration
   - Test on physical device (not simulator)

2. **Network Requests Failing**
   - Check App Transport Security settings
   - Verify server URL configuration
   - Test with HTTP in development

3. **Authentication Issues**
   - Verify server endpoints
   - Check token storage
   - Test with different user types

## Security Considerations

1. **Server Security**
   - Use strong JWT secrets
   - Implement rate limiting
   - Use HTTPS in production
   - Regular security updates

2. **iOS App Security**
   - Store tokens in Keychain
   - Validate all server responses
   - Use certificate pinning for production
   - Implement proper error handling

## Performance Optimization

1. **Server Optimization**
   - Use connection pooling
   - Implement caching
   - Optimize database queries
   - Use CDN for static files

2. **iOS App Optimization**
   - Implement proper image caching
   - Use lazy loading for large lists
   - Optimize audio streaming
   - Monitor memory usage

## Support

For issues and questions:
1. Check this documentation
2. Review server logs
3. Check iOS device logs
4. Test with minimal configuration
5. Create detailed issue reports

## License

This project is provided as-is for educational and development purposes. Please ensure you have proper licenses for any third-party content and comply with all applicable laws and regulations.