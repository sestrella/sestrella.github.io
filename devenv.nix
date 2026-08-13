{ pkgs, ... }:

{
  packages = [
    pkgs.gitleaks
    pkgs.trufflehog
  ];

  languages.javascript = {
    enable = true;
    pnpm.enable = true;
  };
}
