var gulp = require('gulp'),
    concat = require('gulp-concat'),
    uglify = require('gulp-uglify'),
    rename = require('gulp-rename');

gulp.task('dist', function() {
    gulp.src([
        "src/_preamble.js",
        "src/Source.js",
        "src/Dependency.js",
        "src/Context.js",
        "src/Environment.js",
        "src/S.js",
        "src/UpdateModifiers.js",
        "src/FormulaOptionBuilder.js",
        "src/Transformers.js",
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
