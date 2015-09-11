var gulp = require('gulp'),
    typescript = require('typescript'),
    ts = require('gulp-typescript'),
    uglify = require('gulp-uglify'),
    rename = require('gulp-rename');

var tsProject = ts.createProject({
    out: 'S.js',
    typescript: typescript
});

gulp.task('dist', function() {
    gulp.src("src/S.ts")
    .pipe(ts(tsProject))
    .pipe(gulp.dest("dist"))
    .pipe(uglify())
    .pipe(rename("S.min.js"))
    .pipe(gulp.dest("dist"));
});

gulp.task('default', ['dist']);
gulp.watch('src/*.ts', ['dist']);
