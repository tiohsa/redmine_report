# frozen_string_literal: true

FakeVersions = Struct.new(:version) do
  def find_by(id:)
    return version if version.id == id

    nil
  end
end

FakeProject = Struct.new(:id, :versions)
FakeVersion = Struct.new(:id)
