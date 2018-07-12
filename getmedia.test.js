import { getMedia } from './index';

test('test getMedia -  a bit pointless since we cant get media like this so it will definitely fail', () => {
    //This should fail ebcause navigator.getUserMedia isnt gna work here
    return getMedia().catch((data) => {
        // console.log("TYPE:", typeof data);
        expect(typeof data).toMatch('object');
    });
});
