export interface ScreenWriter {
  write(text: string): void;
  clear(): void;
  moveHome(): void;
}

export function createScreenWriter(out: NodeJS.WriteStream = process.stdout): ScreenWriter {
  return {
    write(text: string) {
      out.write(text);
    },
    clear() {
      out.write("\x1b[2J");
    },
    moveHome() {
      out.write("\x1b[H");
    },
  };
}

export function redrawFrame(writer: ScreenWriter, lines: string[]): void {
  writer.moveHome();
  writer.write(lines.join("\n"));
}
