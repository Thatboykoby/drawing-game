const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'game.html'));
});

// Game rooms storage
const rooms = {};

// Word list for the game
const wordList = [
    'CAT', 'DOG', 'HOUSE', 'TREE', 'CAR', 'PIZZA', 'SUN', 'MOON', 
    'FLOWER', 'FISH', 'BIRD', 'AIRPLANE', 'GUITAR', 'BOOK', 'COMPUTER',
    'PHONE', 'APPLE', 'BANANA', 'BEACH', 'MOUNTAIN', 'ROCKET', 'STAR'
];

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join-room', ({ playerName, roomCode }) => {
        // Create room if it doesn't exist
        if (!rooms[roomCode]) {
            rooms[roomCode] = {
                players: [],
                currentDrawerIndex: 0,
                currentWord: '',
                round: 1,
                maxRounds: 3,
                timeLeft: 60,
                timer: null
            };
        }

        const room = rooms[roomCode];
        
        // Add player to room
        const player = {
            id: socket.id,
            name: playerName,
            score: 0,
            hasGuessed: false
        };
        
        room.players.push(player);
        socket.join(roomCode);
        socket.roomCode = roomCode;
        socket.playerName = playerName;

        // Send room info to player
        socket.emit('room-joined', {
            roomCode,
            players: room.players,
            currentDrawer: room.players[room.currentDrawerIndex]?.name,
            round: room.round,
            maxRounds: room.maxRounds
        });

        // Notify other players
        socket.to(roomCode).emit('player-joined', {
            playerName,
            players: room.players
        });

        // Start game if first player
        if (room.players.length === 1) {
            startRound(roomCode);
        }
    });

    socket.on('start-drawing', () => {
        const roomCode = socket.roomCode;
        if (!roomCode || !rooms[roomCode]) return;

        const room = rooms[roomCode];
        const currentDrawer = room.players[room.currentDrawerIndex];
        
        if (currentDrawer && currentDrawer.id === socket.id) {
            socket.emit('drawing-started', { word: room.currentWord });
        }
    });

    socket.on('draw', (data) => {
        const roomCode = socket.roomCode;
        if (!roomCode) return;
        
        // Broadcast drawing to other players in room
        socket.to(roomCode).emit('draw', data);
    });

    socket.on('clear-canvas', () => {
        const roomCode = socket.roomCode;
        if (!roomCode) return;
        
        socket.to(roomCode).emit('clear-canvas');
    });

    socket.on('guess', ({ guess }) => {
        const roomCode = socket.roomCode;
        if (!roomCode || !rooms[roomCode]) return;

        const room = rooms[roomCode];
        const player = room.players.find(p => p.id === socket.id);
        
        if (!player || player.hasGuessed) return;

        // Broadcast guess to all players
        io.to(roomCode).emit('chat-message', {
            playerName: socket.playerName,
            message: guess
        });

        // Check if guess is correct
        if (guess.toUpperCase() === room.currentWord) {
            const points = Math.max(10, room.timeLeft);
            player.score += points;
            player.hasGuessed = true;

            io.to(roomCode).emit('correct-guess', {
                playerName: socket.playerName,
                points,
                players: room.players
            });

            // Check if all players have guessed
            const allGuessed = room.players.every(p => 
                p.id === room.players[room.currentDrawerIndex].id || p.hasGuessed
            );

            if (allGuessed) {
                endRound(roomCode);
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        
        const roomCode = socket.roomCode;
        if (!roomCode || !rooms[roomCode]) return;

        const room = rooms[roomCode];
        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        
        if (playerIndex !== -1) {
            const playerName = room.players[playerIndex].name;
            room.players.splice(playerIndex, 1);

            // Notify other players
            io.to(roomCode).emit('player-left', {
                playerName,
                players: room.players
            });

            // Delete room if empty
            if (room.players.length === 0) {
                if (room.timer) clearInterval(room.timer);
                delete rooms[roomCode];
            } else {
                // Adjust drawer index if needed
                if (room.currentDrawerIndex >= room.players.length) {
                    room.currentDrawerIndex = 0;
                }
            }
        }
    });
});

function startRound(roomCode) {
    const room = rooms[roomCode];
    if (!room || room.players.length === 0) return;

    // Select random word
    room.currentWord = wordList[Math.floor(Math.random() * wordList.length)];
    room.timeLeft = 60;
    
    // Reset guessed status
    room.players.forEach(p => p.hasGuessed = false);

    const currentDrawer = room.players[room.currentDrawerIndex];

    // Notify all players about new round
    room.players.forEach(player => {
        const socket = io.sockets.sockets.get(player.id);
        if (socket) {
            if (player.id === currentDrawer.id) {
                socket.emit('round-started', {
                    word: room.currentWord,
                    isDrawer: true,
                    round: room.round,
                    timeLeft: room.timeLeft
                });
            } else {
                socket.emit('round-started', {
                    word: '_'.repeat(room.currentWord.length),
                    isDrawer: false,
                    round: room.round,
                    timeLeft: room.timeLeft
                });
            }
        }
    });

    // Start timer
    if (room.timer) clearInterval(room.timer);
    room.timer = setInterval(() => {
        room.timeLeft--;
        io.to(roomCode).emit('timer-update', { timeLeft: room.timeLeft });

        if (room.timeLeft <= 0) {
            clearInterval(room.timer);
            endRound(roomCode);
        }
    }, 1000);
}

function endRound(roomCode) {
    const room = rooms[roomCode];
    if (!room) return;

    if (room.timer) clearInterval(room.timer);

    // Reveal word
    io.to(roomCode).emit('round-ended', {
        word: room.currentWord,
        players: room.players
    });

    setTimeout(() => {
        room.round++;
        
        if (room.round > room.maxRounds) {
            endGame(roomCode);
        } else {
            // Move to next drawer
            room.currentDrawerIndex = (room.currentDrawerIndex + 1) % room.players.length;
            startRound(roomCode);
        }
    }, 3000);
}

function endGame(roomCode) {
    const room = rooms[roomCode];
    if (!room) return;

    // Find winner
    const winner = room.players.reduce((prev, current) => 
        (prev.score > current.score) ? prev : current
    );

    io.to(roomCode).emit('game-ended', {
        winner: winner.name,
        players: room.players
    });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🎮 Game server running on http://localhost:${PORT}`);
});
