import fs from 'fs';
import path from 'path';

/**
 * Safe file writing utility
 * Creates directories as needed and handles conflicts
 */
export class FileWriter {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  /**
   * Write file to target directory
   */
  write(relativePath: string, content: string): void {
    const targetPath = path.join(this.baseDir, relativePath);
    const targetDir = path.dirname(targetPath);

    // create directory if it doesn't exist
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // write file
    fs.writeFileSync(targetPath, content, 'utf8');
  }

  /**
   * Check if file exists
   */
  exists(relativePath: string): boolean {
    const targetPath = path.join(this.baseDir, relativePath);
    return fs.existsSync(targetPath);
  }

  /**
   * Read file content
   */
  read(relativePath: string): string {
    const targetPath = path.join(this.baseDir, relativePath);
    return fs.readFileSync(targetPath, 'utf8');
  }

  /**
   * Copy file from source to target
   */
  copy(sourcePath: string, relativePath: string): void {
    const content = fs.readFileSync(sourcePath, 'utf8');
    this.write(relativePath, content);
  }
}
