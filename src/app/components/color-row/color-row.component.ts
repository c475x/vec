import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as paper from 'paper';

@Component({
    selector: 'app-color-row',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './color-row.component.html',
    styleUrls: ['./color-row.component.scss']
})
export class ColorRowComponent {
    @Input() label!: string;
    @Input() fixed = false;
    @Input() visible = true;
    @Input() set color(value: string | paper.Gradient) {
        if (typeof value === 'string') {
            this.colorValue = value;
        } else if (value instanceof paper.Gradient) {
            // For gradients, use the first stop color as a preview
            this.colorValue = value.stops[0].color.toCSS(true);
        }
    }
    
    get color(): string {
        return this.colorValue;
    }

    @Output() colorChange = new EventEmitter<string>();
    @Output() toggleVisible = new EventEmitter<boolean>();

    colorValue = '#000000';

    onColorChange(event: Event): void {
        const input = event.target as HTMLInputElement;
        this.colorChange.emit(input.value);
    }

    onToggleVisible(): void {
        this.visible = !this.visible;
        this.toggleVisible.emit(this.visible);
    }

    openPicker(): void {
        const input = document.createElement('input');
        input.type = 'color';
        input.value = this.colorValue;
        input.onchange = () => this.colorChange.emit(input.value);
        input.click();
    }
}
