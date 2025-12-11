# Carousel Prompt Tester

A standalone test environment for testing and refining carousel image generation prompts using Google Gemini AI.

## Features

- **3-Stage Testing Process:**
  1. Test prompts for generating slide content (text) from transcripts
  2. Test prompts for generating the first slide image (establishes design style)
  3. Test prompts for generating remaining slides (using first image as reference)

- **Visual Feedback:** See generated slides in a carousel format as they're created
- **Token Tracking:** Monitor token usage for each generation
- **Real-time Testing:** Quickly iterate on prompts without affecting production

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Create a `.env` file:

```bash
cp .env.example .env
```

Edit `.env` and add your Google AI API key:

```env
GOOGLE_AI_API_KEY=your_actual_api_key_here
PORT=3001
```

### 3. Run the Server

For development (with auto-reload):
```bash
npm run dev
```

For production:
```bash
npm run build
npm start
```

### 4. Open in Browser

Navigate to: `http://localhost:3001`

## Usage

### Step 1: Generate Slide Content

1. Paste your video transcript in the "Transcript" text area
2. (Optional) Customize the content generation prompt in the first text box
3. Click "Generate Slide Content"
4. Review the generated slides (headings + explanations)

**Default Content Prompt:**
```
Generate a very very detailed note of all the key points mentioned in this transcript. 
The number of key points identified can be anywhere between 1 to 15 depending on the 
density of high value information. Present it in the format "Slide [N] \n Heading: 
[Punchy action-oriented title] \n Explanation: [The detailed key note points 
corresponding to the heading from the transcript]"
```

### Step 2: Generate First Image

1. (Optional) Customize the first image generation prompt
2. Click "Generate First Slide Image"
3. This establishes the visual style for all subsequent slides

**Default First Image Prompt:**
```
This is the content for the slide {heading} + {explanation}.
```

### Step 3: Generate Remaining Images

1. (Optional) Customize the remaining images prompt
2. Click "Generate Remaining Images"
3. All remaining slides will be generated using the first image as a style reference

**Default Remaining Images Prompt:**
```
This is the content for the slide {heading} + {explanation}. 
Follow the design style as per the image attached
```

## Testing Strategy

### Prompt Experimentation

Try different prompt variations:

**For Content Generation:**
- "Extract key lessons as actionable bullet points..."
- "Identify main concepts and supporting examples..."
- "Summarize in storytelling format with clear narratives..."

**For First Image:**
- "Create a modern, minimalist infographic design..."
- "Design a vibrant, colorful slide with icons..."
- "Generate a professional corporate style presentation slide..."

**For Remaining Images:**
- "Match the color scheme and typography exactly..."
- "Use the same design elements but vary the layout..."
- "Maintain consistency in style while adapting to content..."

### Comparison Testing

1. Generate a carousel with default prompts
2. Note the results (design quality, consistency, etc.)
3. Modify prompts and regenerate
4. Compare outputs to find optimal prompts

## Models Used

- **Content Generation:** `gemini-2.0-flash`
- **Image Generation:** `gemini-3-pro-image-preview`

## File Structure

```
carousel-test/
├── src/
│   └── server.ts          # Express backend
├── public/
│   └── index.html         # Frontend UI
├── uploads/
│   └── carousel/          # Generated images
├── package.json
├── tsconfig.json
└── .env
```

## API Endpoints

### POST `/api/generate-content`
Generate slide content from transcript

**Request:**
```json
{
  "prompt": "Custom prompt (optional)",
  "transcript": "Video transcript text"
}
```

**Response:**
```json
{
  "success": true,
  "slides": [
    {
      "slideNumber": 1,
      "heading": "Key Point Title",
      "explanation": "Detailed explanation..."
    }
  ]
}
```

### POST `/api/generate-first-image`
Generate first slide image

**Request:**
```json
{
  "prompt": "Custom prompt (optional)",
  "heading": "Slide heading",
  "explanation": "Slide explanation",
  "slideNumber": 1,
  "totalSlides": 10
}
```

**Response:**
```json
{
  "success": true,
  "imageUrl": "/uploads/carousel/test-slide-1-xxx.png",
  "tokens": {
    "input": 100,
    "output": 200,
    "total": 300
  }
}
```

### POST `/api/generate-remaining-images`
Generate remaining slide images with reference

**Request:**
```json
{
  "prompt": "Custom prompt (optional)",
  "slides": [/* array of remaining slides */],
  "firstImageUrl": "/uploads/carousel/test-slide-1-xxx.png"
}
```

**Response:**
```json
{
  "success": true,
  "results": [
    {
      "slideNumber": 2,
      "imageUrl": "/uploads/carousel/test-slide-2-xxx.png",
      "status": "completed",
      "tokens": { "total": 300 }
    }
  ]
}
```

## Troubleshooting

### Images Not Generating

- Verify your Google AI API key is correct
- Check that the API key has access to `gemini-3-pro-image-preview`
- Ensure the `uploads/carousel` directory exists and is writable

### Style Reference Not Working

- Make sure the first image was generated successfully
- Verify the file path exists in `uploads/carousel`
- Check that the image file is a valid PNG

### Prompts Not Producing Desired Results

- Start with default prompts and make incremental changes
- Be specific about design elements you want
- Test with different transcript lengths and content types

## Tips for Better Results

1. **Content Prompts:** Be clear about format and structure requirements
2. **First Image Prompt:** Specify visual style, colors, layout preferences
3. **Remaining Images Prompt:** Emphasize consistency while allowing content adaptation
4. **Transcript Quality:** Better transcripts lead to better slide content
5. **Iteration:** Test multiple prompt variations to find what works best

## License

MIT
