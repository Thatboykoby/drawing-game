# 🎨 Draw & Guess - Multiplayer Game

A fun real-time multiplayer drawing and guessing game built with HTML, CSS, JavaScript, and Socket.io!

## Features

- 🎮 Real-time multiplayer gameplay
- 🎨 Drawing canvas with multiple colors
- 💬 Live chat and guessing
- 🏆 Score tracking
- 🔄 Multiple rounds with rotating drawers
- 📱 Responsive design

## How to Play

1. One player draws a word they're given
2. Other players try to guess what it is
3. First to guess correctly gets points
4. Players take turns drawing
5. Highest score wins!

## Quick Start

### Local Development

1. **Install Node.js** (if you haven't already)
   - Download from [nodejs.org](https://nodejs.org/)

2. **Clone or download this repository**

3. **Install dependencies**
   ```bash
   npm install
   ```

4. **Start the server**
   ```bash
   npm start
   ```

5. **Open your browser**
   - Go to `http://localhost:3000`
   - Share this URL with friends on your local network!

## Deploying to GitHub Pages + Free Hosting

### Option 1: Deploy to Render (Recommended - Free & Easy)

1. **Push your code to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin YOUR_GITHUB_REPO_URL
   git push -u origin main
   ```

2. **Deploy on Render**
   - Go to [render.com](https://render.com) and sign up
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Configure:
     - **Name**: draw-and-guess
     - **Environment**: Node
     - **Build Command**: `npm install`
     - **Start Command**: `npm start`
   - Click "Create Web Service"
   - Your game will be live at `https://your-app-name.onrender.com`

### Option 2: Deploy to Heroku

1. **Install Heroku CLI**
   ```bash
   npm install -g heroku
   ```

2. **Login and create app**
   ```bash
   heroku login
   heroku create your-game-name
   ```

3. **Deploy**
   ```bash
   git push heroku main
   heroku open
   ```

### Option 3: Deploy to Railway

1. Go to [railway.app](https://railway.app)
2. Click "Start a New Project"
3. Select "Deploy from GitHub repo"
4. Select your repository
5. Railway will auto-detect Node.js and deploy
6. Your game will be live!

### Option 4: Deploy to Glitch

1. Go to [glitch.com](https://glitch.com)
2. Click "New Project" → "Import from GitHub"
3. Enter your GitHub repository URL
4. Your game will be instantly live!

## Playing with Friends

Once deployed:
1. Share the URL with your friends
2. Everyone enters their name
3. One person creates a room (leaves room code empty)
4. They share the room code with others
5. Others enter the same room code to join
6. Have fun!

## Local Network Play

If you just want to play with friends on the same WiFi:

1. Start the server with `npm start`
2. Find your local IP address:
   - **Windows**: Run `ipconfig` in command prompt
   - **Mac/Linux**: Run `ifconfig` or `ip addr`
3. Share `http://YOUR_IP:3000` with friends on the same network

## Customization

### Change Word List
Edit `server.js` and modify the `wordList` array:
```javascript
const wordList = [
    'YOUR', 'CUSTOM', 'WORDS', 'HERE'
];
```

### Change Colors
Edit `game.html` and add more color pickers in the tools section:
```html
<div class="color-picker" style="background: pink;" onclick="selectColor('pink')"></div>
```

### Adjust Game Settings
In `server.js`, modify:
- `maxRounds: 3` - Change number of rounds
- `timeLeft: 60` - Change time per round (seconds)

## File Structure

```
├── game.html       # Main game interface
├── server.js       # Node.js server with Socket.io
├── package.json    # Dependencies and scripts
└── README.md       # This file
```

## Technologies Used

- **Frontend**: HTML5, CSS3, JavaScript (Canvas API)
- **Backend**: Node.js, Express
- **Real-time**: Socket.io (WebSockets)

## Troubleshooting

### "Cannot find module 'express'"
Run `npm install` to install dependencies

### Port already in use
Change the port in `server.js`:
```javascript
const PORT = process.env.PORT || 3001; // Change 3000 to 3001
```

### Game not loading
- Check if server is running (`npm start`)
- Check browser console for errors (F12)
- Make sure you're using a modern browser

## Future Ideas

- [ ] Add more drawing tools (eraser, different brush sizes)
- [ ] Add sound effects
- [ ] Add difficulty levels
- [ ] Add word categories
- [ ] Add spectator mode
- [ ] Add replay feature
- [ ] Mobile touch support improvements

## License

MIT License - feel free to use and modify!

---

Made with ❤️ for fun with friends!
