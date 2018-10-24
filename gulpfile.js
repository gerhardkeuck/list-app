const gulp = require('gulp');
const del = require('del');
const workboxBuild = require('workbox-build');

const clean = () => {
	return del(['build/*'], {dot: true});
};
gulp.task('clean', clean);

const copy =()=>{
	return gulp.src(['app/**/*']).pipe(gulp.dest('build'));
};
gulp.task('copy',copy);

const serviceWorker = () => {
	return workboxBuild.injectManifest({
		swSrc: 'app/sw.js',
		swDest: 'build/sw.js',
		globDirectory: 'build',
		globPatterns: [
			'index.html',
			'main.js'
		]
	}).then(resources => {
		console.log(`Injected ${resources.count} resources for precaching, ` +
			`totaling ${resources.size} bytes.`);
	}).catch(err => {
		console.log('Uh oh 😬', err);
	});
};
gulp.task('service-worker', serviceWorker);

const build = gulp.series('clean','copy', 'service-worker');
gulp.task('build',build);

const watch=()=>{
	gulp.watch('app/**/*',build);
};
gulp.task('watch',watch);

gulp.task('default', build);