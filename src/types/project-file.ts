export interface ProjectFile {
  id: number;
  projectId: number;
  fileName: string;
  fileStorageKey: string;
  fileUrl: string;
  fileSize: number;
  fileMimeType: string;
  fileCategory: string | null;
  fileDescription: string | null;
  createdAt: string;
  createdBy: number | null;
  creator?: {
    id: number;
    userName: string;
  } | null;
}

export interface FileCategory {
  key: string;
  label: string;
  sortOrder: number;
}
