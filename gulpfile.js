var gulp = require('gulp'),
    concat = require('gulp-concat'),
    uglify = require('gulp-uglify'),
    rename = require('gulp-rename');

gulp.task('dist', function() {
    gulp.src([
        "src/_preamble.js",
        "src/graph.js",
        "src/S.js",
        "src/schedulers.js",
        "src/options.js",
        "src/_postamble.js"
    ])
    .pipe(concat("S.js"))
    .pipe(gulp.dest("dist"))
    .pipe(rename("S.min.js"))
    .pipe(uglify())
    .pipe(gulp.dest("dist"));
});

gulp.task('default', ['dist']);
gulp.watch('src/*.js', ['dist']);
