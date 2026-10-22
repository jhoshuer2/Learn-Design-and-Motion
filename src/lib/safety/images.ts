/**
 * The seam for automated image screening. Nothing implements it yet: the only image control today is human approval
 * before anything is Public. A real screener (a vision model, a hash-match service) plugs in here and its verdict is
 * recorded next to the reviewer's decision, never instead of it.
 */
export type ImageVerdict = { screener: string; status: "unscreened" | "clear" | "flagged"; detail?: string };

export interface ImageScreener {
  readonly name: string;
  screen(images: { data: Buffer; mime: string }[]): Promise<ImageVerdict>;
}

export class NoopScreener implements ImageScreener {
  readonly name = "none";
  async screen(): Promise<ImageVerdict> {
    return { screener: this.name, status: "unscreened", detail: "No automated image screening is configured." };
  }
}

export const getImageScreener = (): ImageScreener => new NoopScreener();
