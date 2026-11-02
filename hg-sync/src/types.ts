export type DocumentCategory = 'wm' | 'av' | 'clean' | 'custom';

export interface ColumnMapping {
  name: string;
  field: string;
  role: 'date' | 'brother' | 'group' | 'text';
  label: string;
}

export interface DocumentTypeConfig {
  id: string;
  name: string;
  targetModule: DocumentCategory;
  headerMatchAny: string[];
  columns: ColumnMapping[];
}

export interface ResolvedPerson {
  rawName: string;
  canonicalName: string;
  hg_id: number | null;
  rvm_id?: string;
  confidence: 'exact' | 'alias' | 'fuzzy' | 'unresolved';
  ambiguous?: boolean;
  candidates?: Array<{ name: string; hg_id: number }>;
}

export interface ExtractedAssignmentRow {
  date: string; // YYYY-MM-DD
  rawDate: string;
  values: Record<string, { raw: string; resolved?: ResolvedPerson }>;
}

export interface ParsedDocument {
  filePath: string;
  fileName: string;
  detectedType: DocumentTypeConfig;
  yearInferred: number;
  rows: ExtractedAssignmentRow[];
  unresolvedCount: number;
}

export interface MidweekSlotAssignment {
  partTitle: string;
  partType: string;
  section: string;
  role: 'Titular' | 'Ajudante';
  assigneeName: string;
  assigneeHgId: number;
  rvmPartId: string;
  status: string;
}

export interface MidweekWeekSchedule {
  weekId: string; // YYYY-MM-DD (Monday)
  weekDisplay: string;
  isPublished: boolean;
  slots: Record<string, MidweekSlotAssignment | null>; // slotKey -> assignment
}

export interface MidweekDiffAction {
  weekId: string;
  slotKey: string;
  slotLabel: string;
  partId?: number; // HG definition ID if available
  action: 'insert' | 'update' | 'clear' | 'noop';
  previousAssignee?: { name: string; hgId: number } | null;
  newAssignee?: { name: string; hgId: number } | null;
  reason: string;
}

export interface SyncLedgerEntry {
  id: string;
  module: 'mm' | 'wm' | 'av' | 'clean';
  date: string;
  slotKey: string;
  assignedHgId: number;
  assignedName: string;
  source: 'rvm' | 'download_pdf';
  syncedAt: string;
}

export interface SyncLogEntry {
  id: string;
  timestamp: string;
  module: string;
  trigger: 'manual_ui' | 'auto_worker';
  summary: string;
  changesCount: number;
  status: 'success' | 'partial' | 'error';
  details?: any;
}
