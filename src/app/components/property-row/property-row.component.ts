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

    /** Whether the current value is a string (for text editing) */
    get isString(): boolean {
        return typeof this.value === 'string';
    }

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
    }

    finishEdit(): void {
        if (this.isString) {
            // Always emit new string value
            this.valueChange.emit(this.displayValue);
            return;
        }
        // if snapshot trigger differs from current - another shape was selected while editing
        if (this.resetTrigger !== this.lastResetTrigger) {
            this.cancelEdit();
            return;
        }
        if (this.editing) {
            this.editing = false;
            this.valueChange.emit(this.displayValue);
        }
    }

    onKeydown(e: KeyboardEvent): void {
        // Prevent non-numeric characters when editing numeric value
        if (!this.isString) {
            const allowedControlKeys = ['Backspace','Tab','Enter','Escape','ArrowLeft','ArrowRight','Home','End','Delete'];
            const isNumericChar = /^[0-9\.\-]$/.test(e.key);
            if (!isNumericChar && !allowedControlKeys.includes(e.key)) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }
        }
        if (e.key === 'Enter') {
            this.finishEdit();
            this.inputEl.nativeElement.blur();
        }
        if (e.key === 'Escape') {
            this.cancelEdit();
            this.inputEl.nativeElement.blur();
        }
        e.stopPropagation();
    }

    // formatted value for display
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
    }
}
