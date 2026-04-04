import { Request, Response } from "express";
import { marked } from "marked";
import { gfmHeadingId } from "marked-gfm-heading-id";
import fs from "fs";
import path from "path";

marked.use(gfmHeadingId());

export const serveDocs = async (req: Request, res: Response) => {
    try {
        const readmePath = path.join(process.cwd(), "README.md");
        const markdown = fs.readFileSync(readmePath, "utf-8");
        const htmlContent = marked(markdown);

        res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
            <title>Zorvyn Finance API</title>
            <link rel="stylesheet"
                href="https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.5.1/github-markdown-dark.min.css"/>
            <style>
                body {
                    background: #0d1117;
                    display: flex;
                    justify-content: center;
                    padding: 2rem;
                }
                .markdown-body {
                    background: #161b22;
                    color: #e6edf3;
                    padding: 2rem 3rem;
                    border-radius: 12px;
                    max-width: 860px;
                    width: 100%;
                    box-shadow: 0 0 30px rgba(0,0,0,0.5);
                }
                .markdown-body table tr {
                    background-color: #161b22;
                    border-top: 1px solid #30363d;
                }
                .markdown-body table tr:nth-child(2n) {
                    background-color: #1c2128;
                }
                .markdown-body table th,
                .markdown-body table td {
                    border: 1px solid #30363d;
                    color: #e6edf3;
                }
            </style>
        </head>
        <body>
            <article class="markdown-body">
                ${htmlContent}
            </article>
        </body>
        </html>
    `);
    } catch (error) {
        console.log("Error in serving docs", error);
        res.status(500).json({ error: "Internal Server error" });
    }
}