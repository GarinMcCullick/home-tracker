import { TestBed } from '@angular/core/testing';

import { WallEditor } from './wall-editor';

describe('WallEditor', () => {
  let service: WallEditor;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(WallEditor);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
