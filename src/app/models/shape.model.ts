export interface ShapeStyle {
    fill: string;
    stroke?: string;
    lineWidth?: number;
    fillEnabled?: boolean;
    strokeEnabled?: boolean;
    alpha?: number;
    radius?: number; // скругление прямоугольника
    shadow?: { offsetX: number; offsetY: number; blur: number; color: string };
    gradient?: { type: 'linear' | 'radial'; colours: string[] };
}

export interface Point { x: number; y: number; }

export interface ImageShape {
    id: number;
    type: 'image';
    x: number;
    y: number;
    w: number;
    h: number;
    src: string;
    _img?: HTMLImageElement;
    style?: ShapeStyle;
}

export type PrimitiveShape =
    | { id: number; type: 'pen'; points: Point[]; style: ShapeStyle }
    | { id: number; type: 'rect'; x: number; y: number; w: number; h: number; style: ShapeStyle }
    | { id: number; type: 'line'; x1: number; y1: number; x2: number; y2: number; style: ShapeStyle }
    | { id: number; type: 'ellipse'; x: number; y: number; rx: number; ry: number; style: ShapeStyle }
    | { id: number; type: 'text'; x: number; y: number; text: string; style: ShapeStyle }
    | { id: number; type: 'comment'; x: number; y: number; text: string; style: ShapeStyle }
    | ImageShape;

export type GroupShape = {
    id: number;
    type: 'group';
    children: Shape[];
    style: ShapeStyle; // общие, пока не используется
};

export type Shape = PrimitiveShape | GroupShape;
