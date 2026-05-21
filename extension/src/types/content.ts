export interface PageMetadata {
  url: string;
  title: string;
  metaDescription: string | null;
  headings: string[]; // h1–h3 text content
}

export type ContentMessage = { type: "PAGE_METADATA"; payload: PageMetadata };
