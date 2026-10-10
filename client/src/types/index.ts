export type Tool = 'select' | 'draw' | 'rect' | 'ellipse' | 'line' | 'arrow' | 'text' | 'sticky' | 'eraser';
export type Participant = { id: string; name: string; color: string; x?: number; y?: number };
export type ShapeOperation = { id: string; objectId: string; kind: 'create' | 'update' | 'delete'; version: number; payload?: Record<string, unknown>; clientOpId: string; userId?: string };
export type RoomPayload = { id: string; name: string; readOnly: boolean; revision: number; snapshot: { objects?: Record<string, Record<string, unknown>>; settings?: { background?: string; grid?: boolean } } };
