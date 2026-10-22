import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

export const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

export const openai = new OpenAI({ apiKey: process.env.OPEN_AI_KEY ?? "" });
