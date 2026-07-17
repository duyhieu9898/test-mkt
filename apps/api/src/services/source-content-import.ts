import { HTTPException } from 'hono/http-exception';
import { importGoogleDriveText } from './google-drive-import';
import { readGoogleDriveFileText } from './google-drive-auth';
import { readOneDriveFileText } from './onedrive-auth';

export interface SourceContentInput {
  brief?: string;
  googleDriveFileId?: string;
  googleDriveFileName?: string;
  googleDriveUrl?: string;
  oneDriveFileId?: string;
  oneDriveFileName?: string;
}

export async function buildEffectiveSourceContext(args: {
  companyId: string;
  userId: string;
  input: SourceContentInput;
  briefLabel?: string;
}): Promise<string | undefined> {
  const { companyId, userId, input, briefLabel = 'Founder brief' } = args;
  const sourceSections: string[] = [];

  if (input.googleDriveFileId) {
    try {
      const imported = await readGoogleDriveFileText(companyId, userId, input.googleDriveFileId);
      sourceSections.push(`Google Drive source (${imported.name}, ${imported.mimeType}):\n${imported.text}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not read selected Google Drive file.';
      throw new HTTPException(400, { message });
    }
  } else if (input.googleDriveUrl) {
    try {
      const imported = await importGoogleDriveText(input.googleDriveUrl);
      sourceSections.push(`Google Drive source (${imported.mimeType}, file ${imported.fileId}):\n${imported.text}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not read Google Drive file.';
      throw new HTTPException(400, { message });
    }
  }

  if (input.oneDriveFileId) {
    try {
      const imported = await readOneDriveFileText(companyId, userId, input.oneDriveFileId);
      sourceSections.push(`OneDrive source (${imported.name}, ${imported.mimeType}):\n${imported.text}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not read selected OneDrive file.';
      throw new HTTPException(400, { message });
    }
  }

  return [
    input.brief?.trim() ? `${briefLabel}:\n${input.brief.trim()}` : '',
    ...sourceSections,
  ].filter(Boolean).join('\n\n') || undefined;
}
