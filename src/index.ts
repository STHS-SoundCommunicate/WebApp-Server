import express from "express";
import fs from "fs";
import path from "path";

const app = express();

app.use(express.json({
    limit: "100mb"
}));

app.use((req: express.Request, res: express.Response, next: express.NextFunction): void => {
    res.header("Access-Control-Allow-Origin", "http://localhost:3001");
    res.header("Access-Control-Allow-Origin", "https://localhost:5173");
    res.header("Access-Control-Allow-Origin", "https://acoustic-exp.yuiful.com");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    next();
});

// 保存
app.post("/save", (req: express.Request, res: express.Response): void => {
    try {
        const originalFileName = req.body.file;
        const parsed: path.ParsedPath = path.parse(originalFileName);

        let fileName = originalFileName;
        let filePath: string = path.join("./data", fileName);
        let count: number = 2;

        while (fs.existsSync(filePath)) {
            fileName = `${parsed.name}(${count})${parsed.ext}`;
            filePath = path.join("./data", fileName);
            count++;
        }

        fs.writeFileSync(
            filePath,
            JSON.stringify(req.body.data, null, 2)
        );
        res.json({
            success: true,
            file: fileName
        });

        console.log(`Saved ${fileName}`);

    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: err
        });
    }
});

app.listen(3000, () => {
    console.log("Server started");
});