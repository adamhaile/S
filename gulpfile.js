var gulp = require('gulp'),
    uglify = require('gulp-uglify'),
    rename = require('gulp-rename');

gulp.task('dist', function() {
    gulp.src("src/S.js")
    .pipe(gulp.dest("dist"))
    .pipe(uglify())
    .pipe(rename("S.min.js"))
    .pipe(gulp.dest("dist"));
});

gulp.task('default', ['dist']);
gulp.watch('src/*.js', ['dist']);
