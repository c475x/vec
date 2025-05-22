import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ActionRowComponent } from './action-row.component';

describe('ActionRowComponent', () => {
    let component: ActionRowComponent;
    let fixture: ComponentFixture<ActionRowComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [ActionRowComponent]
        })
            .compileComponents();

        fixture = TestBed.createComponent(ActionRowComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
