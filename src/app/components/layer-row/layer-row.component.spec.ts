import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LayerRowComponent } from './layer-row.component';

describe('LayerRowComponent', () => {
    let component: LayerRowComponent;
    let fixture: ComponentFixture<LayerRowComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [LayerRowComponent]
        })
            .compileComponents();

        fixture = TestBed.createComponent(LayerRowComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
