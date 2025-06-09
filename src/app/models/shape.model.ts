import * as paper from 'paper';

export interface GradientStop {
    offset: number;
    color: string;
    alpha?: number;
}

export interface BaseGradient {
    stops: GradientStop[];
    origin: paper.Point;
}

export interface LinearGradient extends BaseGradient {
    type: 'linear';
    destination: paper.Point;
}

export interface RadialGradient extends BaseGradient {
    type: 'radial';
    radius: number;
    focus?: paper.Point; // For focal point different from origin
}

export type Gradient = LinearGradient | RadialGradient;

export interface Point2D {
    x: number;
    y: number;
}

export interface ShapeStyle {
    opacity?: number;
    fill?: string | paper.Gradient | Gradient;
    fillEnabled?: boolean;
    stroke?: string;
    strokeEnabled?: boolean;
    strokeWidth?: number;
    shadowBlur?: number;
    shadowOffset?: Point2D;
    shadowColor?: string;
    shadowOpacity?: number;
}

export interface BaseShape {
    id: number;
    name?: string;
    style: ShapeStyle;
    selected?: boolean;
    locked?: boolean;
    visible?: boolean;
    paperObject?: paper.Item; // Reference to the actual Paper.js object
}

export interface PathShape extends BaseShape {
    type: 'path';
    segments: paper.Segment[];
    closed: boolean;
}

export interface RectangleShape extends BaseShape {
    type: 'rectangle';
    topLeft: paper.Point;
    size: paper.Size;
    radius?: number;
}

export interface EllipseShape extends BaseShape {
    type: 'ellipse';
    center: paper.Point;
    radius: paper.Size;
}

export interface TextShape extends BaseShape {
    type: 'text';
    content: string;
    position: paper.Point;
    fontSize?: number;
    fontFamily?: string;
    justification?: string;
}

export interface ImageShape extends BaseShape {
    type: 'image';
    source: string;
    position: paper.Point;
    size: paper.Size;
    radius?: number;
}

export interface GroupShape extends BaseShape {
    type: 'group';
    children: Shape[];
}

export type Shape = 
    | PathShape 
    | RectangleShape 
    | EllipseShape 
    | TextShape 
    | ImageShape 
    | GroupShape;

export interface CanvasState {
    shapes: Shape[];
    selectedShapes: Set<number>;
    activeLayer?: number;
    zoom: number;
    pan: paper.Point;
}
