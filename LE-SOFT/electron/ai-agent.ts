import { GoogleGenAI } from '@google/genai';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';

// Read the Gemini API key from the local config
function getGeminiToken(): string | null {
    try {
        const cfgPath = path.join(app.getPath('userData'), 'supabase-config.json');
        if (fs.existsSync(cfgPath)) {
            const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
            return cfg.geminiKey || null;
        }
    } catch (err) {
        console.error('[AI-Agent] Error reading config for Gemini Key:', err);
    }
    return null;
}

/**
 * Downloads a webpage and extracts the raw, visible text.
 * Strips out script tags, styles, and SVG paths to save LLM tokens.
 */
async function fetchCompetitorText(url: string): Promise<string> {
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const html = await response.text();
        const $ = cheerio.load(html);

        // Remove unnecessary heavy elements before converting to text
        $('script, style, noscript, iframe, img, svg, path, link, meta, header, footer, nav').remove();

        // Get the visible text, replacing multiple spaces with a single space
        let text = $('body').text();
        text = text.replace(/\s+/g, ' ').trim();

        // Truncate to a reasonable character limit to avoid blowing up the LLM token context
        // 40,000 characters is roughly 10,000 tokens. Plenty for a product page.
        if (text.length > 40000) {
            text = text.substring(0, 40000);
        }

        return text;
    } catch (error: any) {
        throw new Error(`Failed to scrape ${url}: ${error.message}`);
    }
}

/**
 * AI Result interface matching the database schema
 */
export interface MarketAnalysisResult {
    competitor_price: number;
    competitor_features: string;
    ai_comparison_insights: string;
}

/**
 * The core Market Analysis Agent.
 * Fetches the competitor's page, feeds it to Gemini 2.0 Flash alongside our product descriptions,
 * and extracts structured JSON insights.
 */
export async function runMarketAnalysis(
    competitorUrl: string, 
    ourProductGroup: string,
    ourProductName: string, 
    ourProductDescription: string
): Promise<MarketAnalysisResult> {
    
    const apiKey = getGeminiToken();
    if (!apiKey) {
        throw new Error("No Gemini API Key configured in Settings.");
    }

    console.log(`[AI-Agent] Fetching competitor URL: ${competitorUrl}`);
    const competitorText = await fetchCompetitorText(competitorUrl);
    console.log(`[AI-Agent] Downloaded and stripped HTML. Length: ${competitorText.length} chars.`);

    console.log(`[AI-Agent] Sending inference to Gemini...`);
    const ai = new GoogleGenAI({ apiKey: apiKey });

    const systemPrompt = `
You are an expert Market Pricing & Feature Analyst agent.
I will provide you with the raw text scraped from a competitor's product webpage.
I will also provide you with our own product's name, group category, and description.

Your job is to:
1. Extract the competitor's price for this specific product. Convert it to a raw number. If there is a range, pick the lowest. If no price is found, return 0.
2. Extract the key features the competitor is offering (shipping, warranty, specific specs, bundled items). Summarize them briefly in bullet points.
3. Compare the competitor's product to OUR product based on the description provided. Note what they offer MORE than us, and what they offer LESS than us. Be analytical.

Respond ONLY with a valid JSON object matching this schema exactly:
{
  "competitor_price": 500,
  "competitor_features": "- Free Shipping\\n- 1 Year Warranty\\n- 16GB RAM",
  "ai_comparison_insights": "The competitor offers a longer warranty but our product has faster local delivery. Their price is 10% lower, but lacks the premium carrying case."
}
`;

    const userPrompt = `
OUR PRODUCT DATA:
Category: ${ourProductGroup}
Name: ${ourProductName}
Description/Features: ${ourProductDescription || 'No description provided.'}

COMPETITOR WEBPAGE TEXT:
${competitorText}
`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [
                { role: 'user', parts: [{ text: systemPrompt + '\n\n' + userPrompt }] }
            ],
            config: {
                temperature: 0.1, // Low temp for highly analytical, factual extraction
                responseMimeType: 'application/json'
            }
        });

        const resultText = response.text();
        if (!resultText) throw new Error("AI returned empty response.");

        // Clean potentially wrapped markdown blocks
        const cleanerJson = resultText.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed: MarketAnalysisResult = JSON.parse(cleanerJson);

        console.log(`[AI-Agent] Successfully analyzed competitor price: ${parsed.competitor_price}`);
        return parsed;

    } catch (error: any) {
        console.error('[AI-Agent] Inference Failed:', error);
        throw new Error(`AI Analysis Failed: ${error.message}`);
    }
}
