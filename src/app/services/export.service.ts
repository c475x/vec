import { Injectable } from '@angular/core';
import { CanvasStore } from './canvas.store';

@Injectable({ providedIn: 'root' })
export class ExportService {
    constructor(private store: CanvasStore) {}

    exportJSON(filename?: string): void {
        const data = JSON.stringify(this.store.shapes$.value, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || `vec-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    importJSON(): void {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json';
        input.onchange = () => {
            const file = input.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    const arr = JSON.parse(reader.result as string);
                    this.store.updateShapes(shapes => {
                        shapes.splice(0, shapes.length, ...arr);
                    });
                } catch {
                    alert('Invalid JSON file');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }
} 