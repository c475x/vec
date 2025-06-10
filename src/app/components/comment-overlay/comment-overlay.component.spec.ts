import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CommentOverlayComponent } from './comment-overlay.component';

describe('CommentOverlayComponent', () => {
    let component: CommentOverlayComponent;
    let fixture: ComponentFixture<CommentOverlayComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [CommentOverlayComponent]
        })
            .compileComponents();

        fixture = TestBed.createComponent(CommentOverlayComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
