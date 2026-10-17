export type AttachmentMetadata = {
    id: string;
    filename: string;
    contentType: string;
    size: number;
};
export const attachmentMimeTypes: Record<string, string> = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    csv: "text/csv",
    txt: "text/plain",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
};
export function attachmentSize(size: number) {
    return size < 1024 * 1024
        ? (size / 1024).toFixed(1) + " KB"
        : (size / (1024 * 1024)).toFixed(1) + " MB";
}
