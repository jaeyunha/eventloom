export const standardImageUploadMimeTypes = ["image/jpeg", "image/png", "image/webp"] as const;

export const standardDocumentUploadMimeTypes = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
] as const;

export const standardPresentationUploadMimeTypes = [
  "application/pdf",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
] as const;

export const standardFileRequestMimeTypes = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
] as const;

export const standardSupportingFileUploadMimeTypes = [
  ...standardDocumentUploadMimeTypes,
  ...standardImageUploadMimeTypes,
] as const;

export const standardUploadMaximumBytes = {
  headshot: 5 * 1024 * 1024,
  slides: 100 * 1024 * 1024,
  supporting_file: 25 * 1024 * 1024,
} as const;

const uploadMimeTypeFriendlyLabels: Readonly<Record<string, string>> = {
  "*/*": "Any file type",
  "application/msword": "Word",
  "application/pdf": "PDF",
  "application/vnd.ms-powerpoint": "PowerPoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PowerPoint",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word",
  "application/zip": "ZIP",
  "audio/*": "Audio files",
  "image/*": "Images",
  "image/jpeg": "JPG",
  "image/png": "PNG",
  "image/webp": "WebP",
  "text/csv": "CSV",
  "text/plain": "Plain text",
  "video/*": "Video files",
};

export function uploadMimeTypeLabel(mimeType: string): string {
  const trimmed = mimeType.trim();
  return uploadMimeTypeFriendlyLabels[trimmed.toLowerCase()] ?? trimmed;
}

export function uploadMimeTypeLabels(mimeTypes: readonly string[]): readonly string[] {
  return [...new Set(mimeTypes.map(uploadMimeTypeLabel).filter((label) => label.length > 0))];
}

export function formatUploadMimeTypes(mimeTypes: readonly string[]): string {
  return uploadMimeTypeLabels(mimeTypes).join(", ");
}
