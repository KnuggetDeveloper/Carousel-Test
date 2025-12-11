import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.static("public"));
app.use("/uploads", express.static("uploads"));

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, "..", "uploads", "carousel");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Initialize Google AI
const ai = new GoogleGenAI({
  apiKey: process.env.GOOGLE_AI_API_KEY || "",
});

interface SlideContent {
  slideNumber: number;
  heading: string;
  explanation: string;
}

interface GenerateContentRequest {
  prompt: string;
  transcript: string;
}

interface GenerateFirstImageRequest {
  prompt: string;
  heading: string;
  explanation: string;
  slideNumber: number;
  totalSlides: number;
}

interface GenerateRemainingImagesRequest {
  prompt: string;
  slides: SlideContent[];
  firstImageUrl: string;
}

// API Routes

/**
 * Generate slide content from transcript
 */
app.post("/api/generate-content", async (req: Request, res: Response) => {
  try {
    const { prompt, transcript } = req.body as GenerateContentRequest;

    if (!transcript) {
      return res.status(400).json({ error: "Transcript is required" });
    }

    if (!prompt || prompt.trim() === "") {
      return res.status(400).json({ 
        error: "Prompt is required", 
        message: "Please provide a content generation prompt in the first text box" 
      });
    }

    // Replace {transcript} placeholder if present in prompt
    const finalPrompt = prompt.replace(/\{transcript\}/g, transcript);

    console.log("📝 Generating content with prompt:", finalPrompt.substring(0, 200));

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: finalPrompt,
    });

    // Extract text from response
    let text = "";
    if (response.text) {
      text = response.text;
    } else if (response.candidates && response.candidates[0]?.content?.parts) {
      text = response.candidates[0].content.parts
        .map((part: any) => part.text || "")
        .join("");
    } else {
      text = JSON.stringify(response);
    }

    console.log("📄 Raw response length:", text.length);

    // Parse the response to extract slides
    const slides: SlideContent[] = parseSlideContent(text);

    console.log(`✅ Parsed ${slides.length} slides`);

    res.json({
      success: true,
      slides,
      rawResponse: text,
    });
  } catch (error) {
    console.error("❌ Error generating content:", error);
    res.status(500).json({
      error: "Failed to generate content",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * Generate the FIRST slide image (no reference)
 */
app.post("/api/generate-first-image", async (req: Request, res: Response) => {
  try {
    const { prompt, heading, explanation, slideNumber, totalSlides } =
      req.body as GenerateFirstImageRequest;

    if (!heading || !explanation) {
      return res.status(400).json({ error: "Heading and explanation are required" });
    }

    // Use prompt from client - replace placeholders with actual values
    let finalPrompt = prompt || "";
    
    if (!finalPrompt || finalPrompt.trim() === "") {
      throw new Error("Prompt is required. Please provide a prompt in the first image prompt box.");
    }
    
    // Replace {heading} and {explanation} placeholders with actual values
    finalPrompt = finalPrompt
      .replace(/\{heading\}/g, heading)
      .replace(/\{explanation\}/g, explanation);
    
    // CRITICAL: Add image generation instruction if not present
    if (!finalPrompt.toLowerCase().includes("generate") && 
        !finalPrompt.toLowerCase().includes("create") && 
        !finalPrompt.toLowerCase().includes("image")) {
      finalPrompt = `Generate an image: ${finalPrompt}`;
    }

    console.log("🎨 Generating first image with prompt:", finalPrompt.substring(0, 300));

    const response = await ai.models.generateContent({
      model: "gemini-3-pro-image-preview",
      contents: finalPrompt,
      config: {
        responseModalities: ["IMAGE"], // Only request IMAGE, not TEXT
        imageConfig: {
          aspectRatio: "1:1",
          imageSize: "2K",
        },
      },
    });

    // Extract image from response
    if (!response.candidates || response.candidates.length === 0) {
      throw new Error("No candidates in response");
    }

    const candidate = response.candidates[0];
    if (!candidate?.content?.parts) {
      throw new Error("No content parts in response");
    }

    let imageData: string | null = null;
    for (const part of candidate.content.parts) {
      if ((part as any).thought) continue;
      if (
        part.inlineData?.mimeType?.includes("image") &&
        part.inlineData?.data
      ) {
        imageData = part.inlineData.data;
        break;
      }
    }

    if (!imageData) {
      throw new Error("No image data found in response");
    }

    // Save image to file
    const timestamp = Date.now();
    const filename = `test-slide-${slideNumber}-${timestamp}.png`;
    const filepath = path.join(uploadsDir, filename);
    const imageUrl = `/uploads/carousel/${filename}`;

    const buffer = Buffer.from(imageData, "base64");
    fs.writeFileSync(filepath, buffer);

    console.log("✅ First image generated:", imageUrl);

    res.json({
      success: true,
      imageUrl,
      slideNumber,
      tokens: {
        input: response.usageMetadata?.promptTokenCount || 0,
        output: response.usageMetadata?.candidatesTokenCount || 0,
        total: response.usageMetadata?.totalTokenCount || 0,
      },
    });
  } catch (error) {
    console.error("❌ Error generating first image:", error);
    res.status(500).json({
      error: "Failed to generate first image",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * Generate REMAINING slide images (with reference to first image)
 */
app.post("/api/generate-remaining-images", async (req: Request, res: Response) => {
  try {
    const { prompt, slides, firstImageUrl } =
      req.body as GenerateRemainingImagesRequest;

    if (!slides || slides.length === 0) {
      return res.status(400).json({ error: "Slides are required" });
    }

    if (!firstImageUrl) {
      return res.status(400).json({ error: "First image URL is required" });
    }

    // Read the reference image
    const styleImagePath = path.join(__dirname, "..", firstImageUrl.replace(/^\//, ""));
    
    if (!fs.existsSync(styleImagePath)) {
      return res.status(400).json({ error: "Reference image not found" });
    }

    const imageData = fs.readFileSync(styleImagePath);
    const base64Image = imageData.toString("base64");

    console.log(`🎨 Generating ${slides.length} images with reference`);

    const results = [];

    for (const slide of slides) {
      try {
        // Use prompt from client - replace placeholders with actual values
        let finalPrompt = prompt || "";
        
        if (!finalPrompt || finalPrompt.trim() === "") {
          throw new Error("Prompt is required. Please provide a prompt in the remaining images prompt box.");
        }
        
        // Replace {heading} and {explanation} placeholders with actual values
        finalPrompt = finalPrompt
          .replace(/\{heading\}/g, slide.heading)
          .replace(/\{explanation\}/g, slide.explanation);
        
        // CRITICAL: Add image generation instruction if not present
        if (!finalPrompt.toLowerCase().includes("generate") && 
            !finalPrompt.toLowerCase().includes("create") && 
            !finalPrompt.toLowerCase().includes("image")) {
          finalPrompt = `Generate an image: ${finalPrompt}`;
        }

        console.log(`🎨 Generating slide ${slide.slideNumber}/${slides.length}`);

        const contents = [
          { text: finalPrompt },
          {
            inlineData: {
              mimeType: "image/png",
              data: base64Image,
            },
          },
        ];

        const response = await ai.models.generateContent({
          model: "gemini-3-pro-image-preview",
          contents,
          config: {
            responseModalities: ["IMAGE"], // Only request IMAGE
            imageConfig: {
              aspectRatio: "1:1",
              imageSize: "2K",
            },
          },
        });

        // Extract image
        if (!response.candidates || response.candidates.length === 0) {
          throw new Error("No candidates in response");
        }

        const candidate = response.candidates[0];
        let slideImageData: string | null = null;

        for (const part of candidate?.content?.parts || []) {
          if ((part as any).thought) continue;
          if (
            part.inlineData?.mimeType?.includes("image") &&
            part.inlineData?.data
          ) {
            slideImageData = part.inlineData.data;
            break;
          }
        }

        if (!slideImageData) {
          throw new Error("No image data found");
        }

        // Save image
        const timestamp = Date.now();
        const filename = `test-slide-${slide.slideNumber}-${timestamp}.png`;
        const filepath = path.join(uploadsDir, filename);
        const imageUrl = `/uploads/carousel/${filename}`;

        const buffer = Buffer.from(slideImageData, "base64");
        fs.writeFileSync(filepath, buffer);

        results.push({
          slideNumber: slide.slideNumber,
          imageUrl,
          status: "completed",
          tokens: {
            input: response.usageMetadata?.promptTokenCount || 0,
            output: response.usageMetadata?.candidatesTokenCount || 0,
            total: response.usageMetadata?.totalTokenCount || 0,
          },
        });

        console.log(`✅ Generated slide ${slide.slideNumber}`);
      } catch (error) {
        console.error(`❌ Failed to generate slide ${slide.slideNumber}:`, error);
        results.push({
          slideNumber: slide.slideNumber,
          imageUrl: null,
          status: "failed",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    res.json({
      success: true,
      results,
    });
  } catch (error) {
    console.error("❌ Error generating remaining images:", error);
    res.status(500).json({
      error: "Failed to generate remaining images",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Helper function to parse slide content
function parseSlideContent(text: string): SlideContent[] {
  const slides: SlideContent[] = [];
  const slideMatches = text.split(/Slide\s+(\d+)/gi);

  for (let i = 1; i < slideMatches.length; i += 2) {
    const slideNum = parseInt(slideMatches[i], 10);
    const content = slideMatches[i + 1] || "";

    // Extract heading
    let heading = "";
    const headingPatterns = [
      /Heading:\s*([^\n]+?)(?:\n\s*\n|Explanation:)/is,
      /Heading:\s*([^\n]+)/i,
      /Heading:\s*(.+?)(?:\n|$)/is,
    ];

    for (const pattern of headingPatterns) {
      const match = content.match(pattern);
      if (match) {
        heading = match[1].trim();
        heading = heading.replace(/\*\*/g, "").replace(/__/g, "");
        break;
      }
    }

    // Extract explanation
    let explanation = "";
    const explanationPatterns = [
      /Explanation:\s*([\s\S]+?)(?=\n\s*Slide\s+\d+|$)/i,
      /Explanation:\s*([\s\S]+?)(?=\n\s*\n\s*Slide|$)/i,
      /Explanation:\s*([\s\S]+)/i,
    ];

    for (const pattern of explanationPatterns) {
      const match = content.match(pattern);
      if (match) {
        explanation = match[1].trim();
        explanation = explanation.replace(/\n\s*\n\s*Slide.*$/is, "").trim();
        explanation = explanation.replace(/\*\*/g, "").replace(/__/g, "");
        if (explanation) break;
      }
    }

    if (heading && explanation) {
      slides.push({
        slideNumber: slideNum,
        heading,
        explanation,
      });
    }
  }

  return slides;
}

// Serve HTML frontend
app.get("/", (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📁 Uploads directory: ${uploadsDir}`);
});