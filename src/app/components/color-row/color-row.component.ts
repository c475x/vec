import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'app-color-row',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './color-row.component.html',
    styleUrl: './color-row.component.scss'
})
export class ColorRowComponent {
    @Input() label!: string;
    @Input() color!: string;
    @Input() visible: boolean = true;
    @Input() fixed: boolean = false;
    @Output() toggleVisible = new EventEmitter<boolean>();
    @Output() colorChange = new EventEmitter<string>();

    openPicker() {
        // placeholder: open native picker
        const input = document.createElement('input');
        input.type = 'color'; input.value = this.color;
        input.onchange = () => this.colorChange.emit(input.value);
        input.click();
    }
}
