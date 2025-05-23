import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'app-property-row',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './property-row.component.html',
    styleUrls: ['./property-row.component.scss'],
})
export class PropertyRowComponent implements OnChanges {
    @Input() label!: string;
    @Input() value!: number | string;
    @Input() unit?: string;
    @Input() resetTrigger: any;

    @Output() valueChange = new EventEmitter<number | string>();

    editing = false;
    displayValue: number | string = '';

    private lastResetTrigger: any;

    @ViewChild('inputEl', { static: false }) inputEl!: ElementRef<HTMLInputElement>;

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['value'] && !this.editing) {
            this.displayValue = this.value;
        }
    }

    startEdit(): void {
        this.editing = true;
        this.displayValue = this.value;
        this.lastResetTrigger = this.resetTrigger;
        setTimeout(() => {
            const inp = this.inputEl.nativeElement;
            inp.focus();
            inp.select();
        }, 10);
        // console.log('[property-row] startEdit:', this.label, this.displayValue);
    }

    finishEdit(): void {
        // если snapshot триггера отличается от текущего - другая фигура была выделена при изменении значения
        if (this.resetTrigger !== this.lastResetTrigger) {
            this.cancelEdit();
            // console.log(`[property-row] edit cancelled for ${this.label} due to trigger mismatch`);
            return;
        }
        if (this.editing) {
            this.editing = false;
            this.valueChange.emit(this.displayValue);
            // console.log(`[property-row] valueChange emitted for ${this.label} =`, this.displayValue);
            // console.log(`[property-row] resetTrigger: ${this.resetTrigger}, lastResetTrigger: ${this.lastResetTrigger}`);
        }
    }

    onKeydown(e: KeyboardEvent): void {
        if (e.key === 'Enter') this.finishEdit();
        if (e.key === 'Escape') this.cancelEdit();
        e.stopPropagation();
    }

    // отформатированное значение для отображения
    get formattedValue(): string {
        const raw = typeof this.displayValue === 'string'
            ? parseFloat(this.displayValue)
            : this.displayValue;
        if (isNaN(raw)) {
            return String(this.displayValue);
        }
        return Number.isInteger(raw)
            ? raw.toString()
            : raw.toFixed(2);
    }

    private cancelEdit(): void {
        this.editing = false;
        this.displayValue = this.value;
        // console.log('cancel edit');
    }
}
