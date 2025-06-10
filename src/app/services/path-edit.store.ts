import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import * as paper from 'paper';
import { CanvasStore } from './canvas.store';
import { PathShape } from '../models/shape.model';

// Describes a segment or handle currently being edited
export interface EditingSegment {
    shapeId: number;
    segmentIndex: number;
    handleType: 'point' | 'handleIn' | 'handleOut';
}

@Injectable({ providedIn: 'root' })
export class PathEditStore {
    /** Currently selected segment/handle for editing (or null) */
    readonly editingSegment$ = new BehaviorSubject<EditingSegment | null>(null);

    constructor(private canvasStore: CanvasStore) {}

    /** Begin editing a segment or handle */
    selectSegment(shapeId: number, segmentIndex: number, handleType: 'point' | 'handleIn' | 'handleOut'): void {
        this.editingSegment$.next({ shapeId, segmentIndex, handleType });
    }

    /** Update the currently editing segment/handle to a new point */
    updateSegment(point: paper.Point): void {
        const seg = this.editingSegment$.value;
        if (!seg) return;
        this.canvasStore.updateShapes(shapes => {
            const shape = shapes.find(s => s.id === seg.shapeId && s.type === 'path') as PathShape | undefined;
            if (!shape) return;
            const segment = shape.segments[seg.segmentIndex];
            switch (seg.handleType) {
                case 'point':
                    segment.point = point;
                    break;
                case 'handleIn':
                    segment.handleIn = point.subtract(segment.point);
                    break;
                case 'handleOut':
                    segment.handleOut = point.subtract(segment.point);
                    break;
            }
        });
    }

    /** Finish editing (clear selection) */
    clearEditing(): void {
        this.editingSegment$.next(null);
    }
}
