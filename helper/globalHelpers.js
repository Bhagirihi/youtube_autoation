import { slugify } from "transliteration";
import fs from "fs";
import { readFile as fsRead } from "fs/promises";
import path from "path";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const createSlug = (str) => slugify(str);

export const saveToFile = (folder, slug, content = "") => {
  console.log("SAVE TO FILE", folder, slug, content);
  if (typeof content !== "string" || content.trim() === "") {
    throw new Error(
      `saveToFile: content for slug "${slug}"  in folder "${folder}" is empty or not a string`
    );
  }

  const dir = path.join(process.cwd(), String(folder));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const filePath = path.join(dir, `${slug}.txt`);
  fs.writeFileSync(filePath, content, "utf8");
  console.log(`✅ Saved ${filePath} (${content.length} chars)`);
};

export async function readFileUtf8(filePath) {
  try {
    return await fsRead(filePath, "utf-8"); // ✅ standard hyphen here
  } catch (err) {
    console.error("❌ Error reading file:", err);
    return "";
  }
}

export async function cleanAndParagraph(raw = "") {
  const paragraphSize = parseInt(process.env.PARAGRAPH_SZ || "3", 10);
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const sentences = lines.reduce(
    (acc, line) => {
      const last = acc.at(-1) ?? "";
      if (last.length < 40 || !/[।!?]$/.test(last))
        acc[acc.length - 1] = (last + " " + line).trim();
      else acc.push(line);
      return acc;
    },
    [""]
  );
  const paras = [];
  for (let i = 0; i < sentences.length; i += paragraphSize)
    paras.push(sentences.slice(i, i + paragraphSize).join(" "));
  return paras.join("\n");
}

export default {
  createSlug,
  saveToFile,
  readFileUtf8,
  sleep,
  cleanAndParagraph,
};
