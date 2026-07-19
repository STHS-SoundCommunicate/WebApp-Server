import express from "express";
import fs from "fs";
import path from "path";
import { Server, Socket } from "socket.io";

const app = express();
const PORT: number = 3000;

app.use(express.json({
    limit: "100mb"
}));

app.use((_req: express.Request, res: express.Response, next: express.NextFunction): void => {
    res.header("Access-Control-Allow-Origin", "https://localhost:5173");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    next();
});

// 保存
// app.post("/save", (req: express.Request, res: express.Response): void => {
//     try {
//         const originalFileName = req.body.file;
//         const parsed: path.ParsedPath = path.parse(originalFileName);
//
//         let fileName = originalFileName;
//         let filePath: string = path.join("./data", fileName);
//         let count: number = 2;
//
//         while (fs.existsSync(filePath)) {
//             fileName = `${parsed.name}(${count})${parsed.ext}`;
//             filePath = path.join("./data", fileName);
//             count++;
//         }
//
//         fs.writeFileSync(
//             filePath,
//             JSON.stringify(req.body.data, null, 2)
//         );
//         res.json({
//             success: true,
//             file: fileName
//         });
//
//         console.log(`Saved ${fileName}`);
//
//     } catch (err) {
//         console.error(err);
//         res.status(500).json({
//             success: false,
//             message: err
//         });
//     }
// });

const s = app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
});

function getRandomInt(min: number, max: number): number {
  const minCeiled: number = Math.ceil(min);
  const maxFloored: number = Math.floor(max);
  return Math.floor(Math.random() * (maxFloored - minCeiled) + minCeiled); // 上限は除き、下限は含む
}

function generateId(): string {
    let roomId: string = getRandomInt(10000, 100000).toString();
    while(roomIds.includes(roomId)) roomId = getRandomInt(10000, 100000).toString();
    roomIds.push(roomId);
    return roomId;
}

const io = new Server(s, {
    cors: {
        origin: "https://localhost:5173"
    },
    maxHttpBufferSize: 100 * 1024 * 1024, // 100mb
});

let roomIds: string[] = [];
let idStore: { [key: string]: string } = {};


// let exp_isEnable: boolean = false;
let exp_data: { [key: string]: {id: number, string_data: string}[] } = {};
let exp_id: { [key: string]: number} = {};
let exp_results: { [key: string]: {id: number, detect: string, correct: number, wrong: number, db: number, try: number, pattern: { [key: string]: string }[], wave: number[]}[]} = {};
let constFile: { [key: string]: { [key: string]: string | number | number[] } } = {};

io.on("connection", (socket: Socket) => {
    console.log("Client connected");

    socket.on('disconnect', (reason) => {
        console.log(`Client disconnected (${reason})`);
        const roomId: string = idStore[socket.id];
        if(roomId) {
            delete idStore[socket.id];
            delete exp_data[roomId];
            delete exp_id[roomId];
            delete exp_results[roomId];
            delete constFile[roomId];
            io.to(roomId).emit('delRoom', roomId);
            io.to(roomId).disconnectSockets(true);
            roomIds = roomIds.filter(id => id !== roomId);
            console.log(`Room ${roomId} deleted`);
        }
    });

    socket.on('selectId', (id: number) => {
       const roomId: string = idStore[socket.id];
       if(roomId) {
           console.log(`Id (${id}) selected in room ${roomId}`);
           io.to(roomId).emit('selectId', id);
           exp_id[roomId] = id;
       }
    });

    socket.on('setFile', (file: string) => {
        const roomId: string = idStore[socket.id];
        if(roomId) {
            console.log(`File set in room ${roomId}`);
            io.to(roomId).emit('setFile', file);
            exp_data[roomId] = JSON.parse(file);
            exp_id[roomId] = exp_data[roomId][0].id;
        }
    });

    socket.on('syncConst', (constData: { [key: string]: string | number | number[] }) => {
        const roomId: string = idStore[socket.id];
        if(roomId) {
            console.log(`Const synced in room ${roomId}`);
            io.to(roomId).emit('syncConst', constData);
            constFile[roomId] = constData;
        }
    });

    // Player

    socket.on("createRoom", () => {
        console.log("Creating room...");
        const roomId: string = generateId();
        socket.join(roomId);
        socket.emit("roomCreated", roomId);
        idStore[socket.id] = roomId;
        console.log(`Room ${roomId} created`);
        console.log(`Rooms: ${roomIds.join(", ")}`);
    });

    // Receiver

    socket.on('joinRoom', async (roomId: string) => {
        console.log(`Trying to join Room ${roomId}...`);
        if(roomIds.includes(roomId)) {
            const sockets = await io.in(roomId).fetchSockets();
            if(sockets.length < 2) {
                socket.join(roomId);
                idStore[socket.id] = roomId;
                io.to(roomId).emit('paired', roomId);
                console.log(`Room ${roomId} joined`);
            } else {
                socket.emit('failedJoin', 'Room is full');
                console.log(`Room ${roomId} is full`);
            }
        } else {
            socket.emit('failedJoin', 'Room not found');
            console.log(`Failed to join Room ${roomId}`);
        }
    });

    socket.on('stopSound', () => {
        const roomId: string = idStore[socket.id];
        if(roomId) {
            console.log('Requested to stop sound');
            io.to(roomId).emit('stopSound');
        }
    });

    socket.on('playSound', (id: number) => {
        const roomId: string = idStore[socket.id];
        if(roomId) {
            console.log(`Requested to play sound ${id}`);
            io.to(roomId).emit('playSound', id);
        }
    })

    socket.on('requestResult', () => {
        const roomId: string = idStore[socket.id];
        if(roomId) {
            console.log('Requested to send result');
            const result_file = {
                "config": constFile[roomId],
                "data": exp_data[roomId],
                "exp_results": exp_results[roomId]
            };
            socket.emit('sendResult', result_file);
        }
    });

    socket.on('expResult', (result, file: string) => {
        const roomId: string = idStore[socket.id];
        if(roomId) {
            try {
                console.log(`Received experiment result ${result.id}`);
                if (!exp_results[roomId]) exp_results[roomId] = [];
                exp_results[roomId].push(result);
                const result_file = {
                    "config": constFile[roomId],
                    "data": exp_data[roomId],
                    "exp_results": exp_results[roomId]
                };
                let filePath: string = path.join("./data", path.basename(file));

                fs.writeFileSync(
                    filePath,
                    JSON.stringify(result_file, null, 2)
                );

                console.log(`Saved temp ${file}`);

            } catch (err) {
                console.error(`Error: ${err}`);
            }
        }
    });

});