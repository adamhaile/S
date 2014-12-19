var gulp = require('gulp'),
    concat = require('gulp-concat'),
    uglify = require('gulp-uglify'),
    rename = require('gulp-rename');

gulp.task('dist', function() {
    gulp.src([
        "src/_preamble.js",
        "src/S.js",
        "src/Chainable.js",
        "src/S.sub.js",
        "src/S.mods.js",
        "src/S.toJSON.js",
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
