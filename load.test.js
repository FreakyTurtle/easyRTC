import { getMedia } from './index';

test('has JEST loaded correctly', () => {
  expect(true).toBe(true);
});

test('test import', () => {
    //This should fail ebcause navigator.getUserMedia isnt gna work here
    return getMedia().catch((data) => {
        // console.log("TYPE:", typeof data);
        expect(typeof data).toMatch('object');
    });
});
