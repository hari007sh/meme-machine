import { randomBytes } from "node:crypto";
import { z } from "zod";

/** A text box on a template, as fractions (0-1) of the image width/height. */
export type Box = { x: number; y: number; w: number; h: number };

export type Template = {
  id: string;
  name: string;
  imagePath: string;
  width: number;
  height: number;
  boxes: Box[];
  meaning: string;
  keywords: string[];
};

export const SituationSchema = z.string().trim().min(3).max(280);

export type Candidate = { template: Template; score: number };

export type Captioned = { templateId: string; texts: string[] };

export type Timings = { embed: number; search: number; generate: number; render: number; total: number };

export type MemeRecord = {
  id: string;
  situation: string;
  templateId: string;
  texts: string[];
  createdAt: string;
  hidden: boolean;
  timings: Timings;
};

export function newMemeId(): string {
  return randomBytes(8).toString("base64url").slice(0, 10);
}
