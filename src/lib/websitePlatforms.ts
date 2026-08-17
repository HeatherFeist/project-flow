// Shared between Settings (the picker) and the standalone /embed-guide/:ownerId
// page (a link-able, no-login-required page written for Nick to follow
// himself, or for Heather to send him directly).
export interface WebsitePlatform {
  value: string;
  label: string;
  /** Step-by-step, in the exact order to follow. */
  steps: string[];
}

export const WEBSITE_PLATFORMS: WebsitePlatform[] = [
  {
    value: "wordpress",
    label: "WordPress",
    steps: [
      "Log in to WordPress and open the page you want the chat on (or create a new page).",
      'Click the + button to add a new block, and search for "Custom HTML".',
      "Click the Custom HTML block to add it to the page.",
      "Copy the code below and paste it into that block.",
      'Click "Update" (or "Publish") in the top right to save the page.',
    ],
  },
  {
    value: "squarespace",
    label: "Squarespace",
    steps: [
      "Open the page you want the chat on and click Edit.",
      'Hover where you want the chat to appear and click the + that shows up, then choose "Code".',
      "Copy the code below and paste it into that Code block.",
      'Click "Save", then make sure the page shows as published.',
    ],
  },
  {
    value: "wix",
    label: "Wix",
    steps: [
      "Open the Wix Editor for your site.",
      'Click "Add Elements" (the + on the left) → "Embed" → "Embed a Widget" (sometimes labeled "HTML iframe" or "Custom Embeds").',
      "Copy the code below and paste it into the embed's code box.",
      "Resize the embed box on the page so the chat has room (about 600px tall works well), then click Publish.",
    ],
  },
  {
    value: "webflow",
    label: "Webflow",
    steps: [
      "Open the page in the Webflow Designer.",
      'Drag an "Embed" element (found in the Add panel, under Components) onto the page where you want the chat.',
      "Copy the code below and paste it into the Embed element's code box.",
      "Click Publish to make the change live.",
    ],
  },
  {
    value: "other",
    label: "Other / custom site",
    steps: [
      "Open your site's HTML in whatever editor you use to make changes.",
      "Copy the code below.",
      "Paste it into the page, exactly where you want the chat box to appear.",
      "Save and publish/upload the change.",
    ],
  },
];

export function embedSnippet(origin: string, ownerId: string): string {
  return `<iframe src="${origin}/estimate/${ownerId}?embed=1" style="width: 100%; height: 600px; border: none;" allow="microphone"></iframe>`;
}
