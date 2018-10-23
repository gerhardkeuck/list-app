const gulp = require('gulp');
const del = require('del');

const clean = () => {
	return del(['build/*'], {dot: true});
};
gulp.task('clean', clean);

const copy =()=>{
	return gulp.src(['app/**/*']).pipe(gulp.dest('build'));
};
gulp.task('copy',copy);

const build = gulp.series('clean','copy');
gulp.task('build',build);

const watch=()=>{
	gulp.watch('app/**/*',build);
};
gulp.task('watch',watch);

gulp.task('default', build);