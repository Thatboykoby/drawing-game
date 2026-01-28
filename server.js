const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'game.html'));
});

// Game state
const rooms = new Map();
const users = new Map();

// Word lists
const wordLists = {
    easy: ['CAT', 'DOG', 'SUN', 'TREE', 'HOUSE', 'CAR', 'FISH', 'BIRD', 'BOOK', 'BALL'],
    medium: ['GUITAR', 'PIZZA', 'MOUNTAIN', 'BEACH', 'ROCKET', 'FLOWER', 'COMPUTER', 'PHONE'],
    hard: ['TELESCOPE', 'HELICOPTER', 'BASKETBALL', 'REFRIGERATOR', 'ELEPHANT', 'BICYCLE']
};

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function broadcastRoomsList() {
    const publicRooms = Array.from(rooms.values())
        .filter(room => room.isPublic && room.status === 'waiting')
        .map(room => ({
            code: room.code,
            name: room.name,
            players: room.players.length,
            maxPlayers: room.maxPlayers,
            rounds: room.maxRounds,
            drawTime: room.drawTime,
            isPublic: room.isPublic,
            status: room.status
        }));
    
    io.emit('rooms-list', publicRooms);
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('set-username', ({ username }) => {
        users.set(socket.id, { username, socket });
        console.log(`User ${username} connected`);
        broadcastRoomsList();
    });

    socket.on('create-room', ({ roomName, maxPlayers, maxRounds, drawTime, isPublic }) => {
        const user = users.get(socket.id);
        if (!user) return;

        const code = generateRoomCode();
        const room = {
            code,
            name: roomName,
            host: socket.id,
            players: [{
                id: socket.id,
                name: user.username,
                score: 0,
                isHost: true,
                isDrawing: false
            }],
            maxPlayers,
            maxRounds,
            drawTime,
            isPublic,
            status: 'waiting', // waiting, playing, finished
            currentRound: 0,
            currentDrawerIndex: 0,
            currentWord: '',
            timeLeft: 0,
            timer: null,
            hintTimer: null,
            revealedLetters: []
        };

        rooms.set(code, room);
        socket.join(code);
        socket.currentRoom = code;

        socket.emit('room-joined', {
            roomCode: code,
            roomName,
            isHost: true,
            players: room.players
        });

        broadcastRoomsList();
        console.log(`Room ${code} created by ${user.username}`);
    });

    socket.on('join-room', ({ roomCode }) => {
        const user = users.get(socket.id);
        const room = rooms.get(roomCode);

        if (!user) {
            socket.emit('error', { message: 'Please set your username first' });
            return;
        }

        if (!room) {
            socket.emit('error', { message: 'Room not found' });
            return;
        }

        if (room.players.length >= room.maxPlayers) {
            socket.emit('error', { message: 'Room is full' });
            return;
        }

        if (room.status !== 'waiting') {
            socket.emit('error', { message: 'Game already in progress' });
            return;
        }

        const player = {
            id: socket.id,
            name: user.username,
            score: 0,
            isHost: false,
            isDrawing: false
        };

        room.players.push(player);
        socket.join(roomCode);
        socket.currentRoom = roomCode;

        socket.emit('room-joined', {
            roomCode,
            roomName: room.name,
            isHost: false,
            players: room.players
        });

        io.to(roomCode).emit('player-update', {
            players: room.players
        });

        broadcastRoomsList();
        console.log(`${user.username} joined room ${roomCode}`);
    });

    socket.on('leave-room', () => {
        const roomCode = socket.currentRoom;
        if (!roomCode) return;

        const room = rooms.get(roomCode);
        if (!room) return;

        room.players = room.players.filter(p => p.id !== socket.id);
        socket.leave(roomCode);
        socket.currentRoom = null;

        if (room.players.length === 0) {
            // Delete empty room
            if (room.timer) clearInterval(room.timer);
            if (room.hintTimer) clearInterval(room.hintTimer);
            rooms.delete(roomCode);
        } else {
            // Assign new host if needed
            if (room.host === socket.id) {
                room.host = room.players[0].id;
                room.players[0].isHost = true;
            }

            io.to(roomCode).emit('player-update', {
                players: room.players
            });
        }

        broadcastRoomsList();
    });

    socket.on('start-game', () => {
        const roomCode = socket.currentRoom;
        const room = rooms.get(roomCode);

        if (!room || room.host !== socket.id) return;
        if (room.players.length < 2) {
            socket.emit('error', { message: 'Need at least 2 players to start' });
            return;
        }

        room.status = 'playing';
        room.currentRound = 1;
        room.currentDrawerIndex = 0;

        io.to(roomCode).emit('game-started');
        startRound(roomCode);
        broadcastRoomsList();
    });

    socket.on('chat-message', ({ message }) => {
        const roomCode = socket.currentRoom;
        const room = rooms.get(roomCode);
        const user = users.get(socket.id);

        if (!room || !user) return;

        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;

        // Check if it's the correct answer
        if (room.status === 'playing' && !player.isDrawing && !player.hasGuessed) {
            if (message.toUpperCase() === room.currentWord) {
                player.hasGuessed = true;
                player.score += Math.max(10, room.timeLeft * 2);
                
                io.to(roomCode).emit('chat-message', {
                    username: user.username,
                    message: '✓ Guessed correctly!',
                    correct: true
                });

                io.to(roomCode).emit('player-update', {
                    players: room.players
                });

                // Check if all players guessed
                const allGuessed = room.players.every(p => 
                    p.isDrawing || p.hasGuessed
                );

                if (allGuessed) {
                    endRound(roomCode);
                }
                return;
            }
        }

        io.to(roomCode).emit('chat-message', {
            username: user.username,
            message,
            correct: false
        });
    });

    socket.on('draw', (data) => {
        const roomCode = socket.currentRoom;
        // Forward drawing data with coordinates, color, and brush size
        socket.to(roomCode).emit('draw', {
            x1: data.x1,
            y1: data.y1,
            x2: data.x2,
            y2: data.y2,
            color: data.color,
            size: data.size || 3
        });
    });

    socket.on('clear-canvas', () => {
        const roomCode = socket.currentRoom;
        socket.to(roomCode).emit('clear-canvas');
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        
        const roomCode = socket.currentRoom;
        if (roomCode) {
            const room = rooms.get(roomCode);
            if (room) {
                room.players = room.players.filter(p => p.id !== socket.id);

                if (room.players.length === 0) {
                    if (room.timer) clearInterval(room.timer);
                    if (room.hintTimer) clearInterval(room.hintTimer);
                    rooms.delete(roomCode);
                } else {
                    if (room.host === socket.id) {
                        room.host = room.players[0].id;
                        room.players[0].isHost = true;
                    }

                    io.to(roomCode).emit('player-update', {
                        players: room.players
                    });
                }

                broadcastRoomsList();
            }
        }

        users.delete(socket.id);
    });
});

function getHintWord(word, revealedIndices) {
    let hint = '';
    for (let i = 0; i < word.length; i++) {
        if (revealedIndices.includes(i)) {
            hint += word[i] + ' ';
        } else {
            hint += '_ ';
        }
    }
    return hint.trim();
}

function revealHint(roomCode) {
    const room = rooms.get(roomCode);
    if (!room || room.status !== 'playing') return;

    // Get unrevealed letter positions
    const word = room.currentWord;
    const unrevealedIndices = [];
    for (let i = 0; i < word.length; i++) {
        if (!room.revealedLetters.includes(i)) {
            unrevealedIndices.push(i);
        }
    }

    // Reveal a random letter if any left
    if (unrevealedIndices.length > 0) {
        const randomIndex = unrevealedIndices[Math.floor(Math.random() * unrevealedIndices.length)];
        room.revealedLetters.push(randomIndex);

        const hintWord = getHintWord(word, room.revealedLetters);

        // Send hint to guessers only
        room.players.forEach(player => {
            if (!player.isDrawing) {
                const socket = io.sockets.sockets.get(player.id);
                if (socket) {
                    socket.emit('hint-revealed', { word: hintWord });
                }
            }
        });
    }
}

function startRound(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return;

    // Select random word
    const allWords = [...wordLists.easy, ...wordLists.medium, ...wordLists.hard];
    room.currentWord = allWords[Math.floor(Math.random() * allWords.length)];
    room.timeLeft = room.drawTime;
    room.revealedLetters = [];

    // Reset players
    room.players.forEach((p, index) => {
        p.isDrawing = index === room.currentDrawerIndex;
        p.hasGuessed = false;
    });

    // Notify players
    room.players.forEach(player => {
        const socket = io.sockets.sockets.get(player.id);
        if (socket) {
            if (player.isDrawing) {
                socket.emit('round-started', {
                    word: room.currentWord,
                    isDrawer: true,
                    round: room.currentRound,
                    timeLeft: room.timeLeft
                });
            } else {
                socket.emit('round-started', {
                    word: '_ '.repeat(room.currentWord.length),
                    isDrawer: false,
                    round: room.currentRound,
                    timeLeft: room.timeLeft
                });
            }
        }
    });

    // Start hint timer - reveal letter every 15 seconds
    if (room.hintTimer) clearInterval(room.hintTimer);
    room.hintTimer = setInterval(() => {
        revealHint(roomCode);
    }, 15000);

    // Start timer
    if (room.timer) clearInterval(room.timer);
    room.timer = setInterval(() => {
        room.timeLeft--;
        io.to(roomCode).emit('timer-update', { timeLeft: room.timeLeft });

        if (room.timeLeft <= 0) {
            clearInterval(room.timer);
            if (room.hintTimer) clearInterval(room.hintTimer);
            endRound(roomCode);
        }
    }, 1000);
}

function endRound(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return;

    if (room.timer) clearInterval(room.timer);
    if (room.hintTimer) clearInterval(room.hintTimer);

    io.to(roomCode).emit('round-ended', {
        word: room.currentWord,
        players: room.players
    });

    setTimeout(() => {
        // Move to next drawer
        room.currentDrawerIndex = (room.currentDrawerIndex + 1) % room.players.length;

        // Check if game should end
        if (room.currentDrawerIndex === 0) {
            room.currentRound++;
        }

        if (room.currentRound > room.maxRounds) {
            endGame(roomCode);
        } else {
            startRound(roomCode);
        }
    }, 3000);
}

function endGame(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return;

    room.status = 'finished';

    const winner = room.players.reduce((prev, current) => 
        (prev.score > current.score) ? prev : current
    );

    io.to(roomCode).emit('game-ended', {
        winner: winner.name,
        players: room.players
    });

    // Return to waiting state after 10 seconds
    setTimeout(() => {
        room.status = 'waiting';
        room.currentRound = 0;
        room.players.forEach(p => {
            p.score = 0;
            p.isDrawing = false;
        });
        broadcastRoomsList();
    }, 10000);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🎮 Game server running on port ${PORT}`);
    console.log(`🌐 Access at http://localhost:${PORT}`);
});
