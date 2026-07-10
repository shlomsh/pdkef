#!/usr/bin/perl
use strict;
use warnings;

my $file = shift @ARGV or die "usage: resolve_conflicts.pl <file>\n";
open(my $fh, '<', $file) or die "open $file: $!";
my @lines = <$fh>;
close $fh;

my @out;
my $i = 0;
while ($i < @lines) {
    my $line = $lines[$i];
    if ($line =~ /^<<<<<<< ours/) {
        my @ours;
        $i++;
        while ($lines[$i] !~ /^=======/) { push @ours, $lines[$i]; $i++; }
        $i++; # skip =======
        my @theirs;
        while ($lines[$i] !~ /^>>>>>>> theirs/) { push @theirs, $lines[$i]; $i++; }
        $i++; # skip >>>>>>> theirs

        if ($ours[0] =~ /^import/) {
            # union: both sides' import lines
            push @out, @ours, @theirs;
        } else {
            # button hunk: emit theirs' PdfShareButton line(s) (drop plain start-over dup), then ours
            for my $tl (@theirs) {
                next if $tl =~ /class="start-over"/;
                push @out, $tl;
            }
            push @out, @ours;
        }
        next;
    }
    push @out, $line;
    $i++;
}

open(my $ofh, '>', $file) or die "write $file: $!";
print $ofh @out;
close $ofh;
print "resolved $file\n";
