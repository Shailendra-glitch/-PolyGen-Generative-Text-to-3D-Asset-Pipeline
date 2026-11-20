import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import type { Request, Response } from "express";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    throw new Error(
      "GEMINI_API_KEY is not configured. Add your Gemini API key in Settings > Secrets."
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

const BLUEPRINT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: {
      type: Type.STRING,
      description: "Short descriptive asset title (3-6 words).",
    },
    category: {
      type: Type.STRING,
      description: "Asset category such as Weaponry, Instrument, Architecture, Vehicle, Prop, or Artifact.",
    },
    designNotes: {
      type: Type.STRING,
      description: "Concise 1-2 sentence technical note describing silhouette construction and PBR material contrast.",
    },
    recommendedFaces: {
      type: Type.INTEGER,
      description: "Recommended target triangle count between 4000 and 20000.",
    },
    parts: {
      type: Type.ARRAY,
      description: "5 to 10 distinct mechanical/sculptural sub-parts forming a cohesive, connected 3D object centered around X=0, Z=0 and standing upright.",
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          name: { type: Type.STRING },
          tier: {
            type: Type.STRING,
            enum: ["primary", "secondary", "accent"],
          },
          geometryType: {
            type: Type.STRING,
            enum: [
              "extrude_profile",
              "lathe_profile",
              "tube_curve",
              "cylinder_taper",
              "faceted_gem",
              "gear_ring",
              "beveled_box",
              "torus",
            ],
          },
          profilePoints: {
            type: Type.ARRAY,
            description: "Required for extrude_profile (closed 2D silhouette) or lathe_profile (radius >= 0 in X, height in Y). Use 6 to 16 points.",
            items: {
              type: Type.ARRAY,
              items: { type: Type.NUMBER },
            },
          },
          curvePoints: {
            type: Type.ARRAY,
            description: "Required for tube_curve: 3 to 7 3D control points [x, y, z].",
            items: {
              type: Type.ARRAY,
              items: { type: Type.NUMBER },
            },
          },
          dimensions: {
            type: Type.OBJECT,
            properties: {
              width: { type: Type.NUMBER },
              height: { type: Type.NUMBER },
              depth: { type: Type.NUMBER },
              radiusTop: { type: Type.NUMBER },
              radiusBottom: { type: Type.NUMBER },
              bevelSize: { type: Type.NUMBER },
              bevelThickness: { type: Type.NUMBER },
              tubeRadius: { type: Type.NUMBER },
              radialSegments: { type: Type.INTEGER },
              teethCount: { type: Type.INTEGER },
              twistAngle: { type: Type.NUMBER },
            },
          },
          transform: {
            type: Type.OBJECT,
            properties: {
              position: {
                type: Type.ARRAY,
                items: { type: Type.NUMBER },
              },
              rotation: {
                type: Type.ARRAY,
                items: { type: Type.NUMBER },
              },
              scale: {
                type: Type.ARRAY,
                items: { type: Type.NUMBER },
              },
            },
            required: ["position", "rotation", "scale"],
          },
          material: {
            type: Type.OBJECT,
            properties: {
              baseColor: {
                type: Type.STRING,
                description: "Hex color like #4a5568",
              },
              secondaryColor: {
                type: Type.STRING,
                description: "Secondary weathering/grain hex color like #7c3f23",
              },
              roughness: { type: Type.NUMBER },
              metalness: { type: Type.NUMBER },
              clearcoat: { type: Type.NUMBER },
              emissiveColor: { type: Type.STRING },
              emissiveIntensity: { type: Type.NUMBER },
              transmission: { type: Type.NUMBER },
              ior: { type: Type.NUMBER },
              pattern: {
                type: Type.STRING,
                enum: [
                  "forged_metal",
                  "rusted_iron",
                  "carved_stone",
                  "brushed_brass",
                  "polished_wood",
                  "obsidian_crystal",
                  "carbon_weave",
                  "ceramic_glaze",
                ],
              },
            },
            required: [
              "baseColor",
              "secondaryColor",
              "roughness",
              "metalness",
              "pattern",
            ],
          },
        },
        required: [
          "id",
          "name",
          "tier",
          "geometryType",
          "dimensions",
          "transform",
          "material",
        ],
      },
    },
  },
  required: ["title", "category", "designNotes", "recommendedFaces", "parts"],
};

const SYSTEM_INSTRUCTION = `You are a Principal 3D Technical Artist & Computational Geometry Architect for PolyGen.
Your task is to convert a text prompt (and optional reference image) into a physically coherent, multi-part 3D procedural asset blueprint.

Rules for geometry quality & physical assembly:
1. Build 5 to 10 distinct parts across three tiers:
   - "primary" (main hull, blade, chassis, body)
   - "secondary" (guards, rings, wheels, wings, roof, stands, handles)
   - "accent" (gems, rivets, lenses, vents, finials, glowing cores)
2. Every part MUST physically connect to or overlap slightly with its parent/neighboring parts in a unified coordinate space (total object span ~1.6 to 2.8 units, centered near X=0, Z=0). Do NOT leave parts floating arbitrarily in space.
3. Prefer expressive geometry types:
   - Use "extrude_profile" with 6-14 clean 2D [x,y] points + bevelSize/bevelThickness for sculpted blades, wings, fins, brackets, arches, or shields.
   - Use "lathe_profile" with 6-14 [radius, y] points (radius >= 0, ordered bottom to top) for turned handles, pommels, vases, nozzles, columns, domes, or chalices.
   - Use "tube_curve" with smooth 3D [x,y,z] control points for pipes, cables, handles, horns, or structural arches.
   - Use "gear_ring" with teethCount (10-28) for mechanical cogs, bezels, astrolabe rings, or collars.
   - Use "faceted_gem" for crystals, jewels, or faceted cores.
   - Use "torus", "cylinder_taper", or "beveled_box" for structural rings, shafts, and housings.
4. Vary PBR roughness by >= 0.25 and metalness across adjacent materials (e.g., rough matte leather/wood/stone next to brushed metal or clearcoated crystal).
5. Use realistic sRGB hex colors (e.g. #8b4513, #3b4252, #d4af37, #1d4ed8). Never return NaN or zero scales.`;

async function generateWithRetry(
  ai: GoogleGenAI,
  contents: unknown,
  maxRetries = 2
) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: contents as string,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          responseSchema: BLUEPRINT_SCHEMA,
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.LOW,
          },
        },
      });
      return response;
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "12mb" }));

  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", service: "PolyGen 3D Engine" });
  });

  app.post("/api/generate", async (req: Request, res: Response) => {
    try {
      const { prompt, referenceImage } = req.body as {
        prompt?: string;
        referenceImage?: { mimeType?: string; data?: string };
      };

      const cleanPrompt = (prompt ?? "").trim();
      if (cleanPrompt.length < 3) {
        res.status(400).json({
          error: "Please enter a descriptive 3D prompt (at least 3 characters).",
        });
        return;
      }

      const ai = getGeminiClient();

      let contents: unknown = `Synthesize a cohesive, detailed multi-part 3D asset blueprint for: "${cleanPrompt}". Ensure all parts connect cleanly with realistic proportions and contrasting PBR finishes.`;

      if (referenceImage?.data && referenceImage?.mimeType) {
        contents = {
          parts: [
            {
              inlineData: {
                mimeType: referenceImage.mimeType,
                data: referenceImage.data,
              },
            },
            {
              text: `Analyze this reference image and the prompt "${cleanPrompt}". Reconstruct its 3D silhouette, structural sub-parts, proportions, and PBR materials as a cohesive multi-part 3D blueprint.`,
            },
          ],
        };
      }

      const response = await generateWithRetry(ai, contents);
      const rawJson = (response.text ?? "").trim();
      if (!rawJson) {
        res.status(502).json({
          error: "Model returned an empty blueprint. Please try refining your prompt.",
        });
        return;
      }

      const parsed = JSON.parse(rawJson);
      res.json({
        blueprint: {
          ...parsed,
          prompt: cleanPrompt,
        },
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to generate 3D blueprint.";
      const status =
        message.includes("API_KEY") || message.includes("GEMINI_API_KEY")
          ? 401
          : 500;
      res.status(status).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, "dist");
    app.use(express.static(distDir));
    app.get("/{*path}", (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`PolyGen server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
